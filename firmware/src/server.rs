use std::ffi::CStr;
use std::net::Ipv4Addr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use esp_idf_svc::eventloop::{EspSubscription, EspSystemEventLoop, System};
use esp_idf_svc::hal::modem::Modem;
use esp_idf_svc::http::server::ws::EspHttpWsDetachedSender;
use esp_idf_svc::http::server::{Configuration as HttpConfig, EspHttpServer};
use esp_idf_svc::http::Method;
use esp_idf_svc::io::Write;
use esp_idf_svc::ipv4::{self, Mask, RouterConfiguration, Subnet};
use esp_idf_svc::netif::{EspNetif, IpEvent, NetifConfiguration, NetifStack};
use esp_idf_svc::nvs::EspDefaultNvsPartition;
use esp_idf_svc::wifi::{
    AccessPointConfiguration, AuthMethod, BlockingWifi, Configuration as WifiConfig, EspWifi,
    WifiDriver, WifiEvent,
};
use esp_idf_svc::ws::FrameType;
use log::{info, warn};

use crate::config::{
    AP_IP_OCTETS, AP_SUBNET_PREFIX, WIFI_CHANNEL, WIFI_MAX_CONNECTIONS, WIFI_PASS, WIFI_SSID,
};
use crate::state::{lock_state, ClientMessage, RobotState};

const HTTP_STACK_SIZE: usize = 8192;

static INDEX_HTML_GZ: &[u8] = include_bytes!("../../web/dist/index.html.gz");

pub struct WsSessionRegistry {
    sessions: Mutex<Vec<EspHttpWsDetachedSender>>,
}

impl WsSessionRegistry {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(Vec::new()),
        }
    }

    pub fn register(&self, sender: EspHttpWsDetachedSender) {
        let session_id = sender.session();
        let mut guard = self
            .sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard.retain(|existing| !existing.is_closed() && existing.session() != session_id);
        guard.push(sender);
        info!(
            "[WS] Client #{} terhubung (total WS aktif: {})",
            session_id,
            guard.len()
        );
    }

    pub fn unregister(&self, session_id: i32) {
        let mut guard = self
            .sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let prev_len = guard.len();
        guard.retain(|existing| existing.session() != session_id && !existing.is_closed());
        if guard.len() != prev_len {
            info!(
                "[WS] Client #{} terputus (total WS aktif: {})",
                session_id,
                guard.len()
            );
        }
    }

    pub fn active_count(&self) -> usize {
        let mut guard = self
            .sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard.retain(|existing| !existing.is_closed());
        guard.len()
    }

    pub fn broadcast_text(&self, json: &str) {
        let mut guard = self
            .sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let payload = json.as_bytes();
        let mut closed_ids = Vec::new();
        guard.retain_mut(|sender| {
            if sender.is_closed() {
                closed_ids.push(sender.session());
                return false;
            }
            if let Err(err) = sender.send(FrameType::Text(false), payload) {
                warn!(
                    "[WS] Gagal kirim telemetri ke client #{}: {:?}",
                    sender.session(),
                    err
                );
                closed_ids.push(sender.session());
                return false;
            }
            true
        });
        if !closed_ids.is_empty() {
            info!(
                "[WS] Membersihkan {} sesi tertutup (total WS aktif: {})",
                closed_ids.len(),
                guard.len()
            );
        }
    }
}

pub struct NetworkRuntime<'d> {
    _wifi: BlockingWifi<EspWifi<'d>>,
    _server: EspHttpServer<'static>,
    _wifi_sub: EspSubscription<'static, System>,
    _ip_sub: EspSubscription<'static, System>,
}

fn format_mac(mac: [u8; 6]) -> String {
    format!(
        "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
        mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]
    )
}

pub fn start_network(
    modem: Modem<'static>,
    sys_loop: EspSystemEventLoop,
    nvs: EspDefaultNvsPartition,
    shared_state: Arc<Mutex<RobotState>>,
    ws_registry: Arc<WsSessionRegistry>,
) -> anyhow::Result<NetworkRuntime<'static>> {
    let station_macs = Arc::new(Mutex::new(Vec::<([u8; 6], Option<Ipv4Addr>)>::new()));

    let macs_wifi = Arc::clone(&station_macs);
    let state_wifi = Arc::clone(&shared_state);
    let wifi_sub = sys_loop.subscribe::<WifiEvent, _>(move |event| match event {
        WifiEvent::ApStaConnected(ev) => {
            let mac = ev.mac();
            let mut list = macs_wifi
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if !list.iter().any(|(m, _)| *m == mac) {
                list.push((mac, None));
            }
            info!(
                "[WIFI] Perangkat terhubung -> MAC={}, AID={}, Total perangkat={}",
                format_mac(mac),
                ev.aid(),
                list.len()
            );
        }
        WifiEvent::ApStaDisconnected(ev) => {
            let mac = ev.mac();
            let mut list = macs_wifi
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            list.retain(|(m, _)| *m != mac);
            let remaining = list.len();
            info!(
                "[WIFI] Perangkat terputus -> MAC={}, AID={}, Total perangkat={}",
                format_mac(mac),
                ev.aid(),
                remaining
            );
            if remaining == 0 {
                // Fail-safe jika semua perangkat Wi-Fi terputus.
                let mut state = lock_state(&state_wifi);
                state.force_stop("Semua perangkat Wi-Fi terputus");
            }
        }
        _ => {}
    })?;

    let macs_ip = Arc::clone(&station_macs);
    let ip_sub = sys_loop.subscribe::<IpEvent, _>(move |event| {
        if let IpEvent::ApStaIpAssigned(ev) = event {
            let ip = ev.ip();
            let mac = ev.mac();
            let mut list = macs_ip
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if let Some(entry) = list.iter_mut().find(|(m, _)| *m == mac) {
                entry.1 = Some(ip);
            } else {
                list.push((mac, Some(ip)));
            }
            info!(
                "[WIFI] IP DHCP diberikan -> IP={}, MAC={}, Total perangkat={}",
                ip,
                format_mac(mac),
                list.len()
            );
        }
    })?;

    let driver = WifiDriver::new(modem, sys_loop.clone(), Some(nvs))?;
    let sta_netif = EspNetif::new(NetifStack::Sta)?;

    let mut ap_netif_cfg = NetifConfiguration::wifi_default_router();
    let gateway_ip = Ipv4Addr::new(
        AP_IP_OCTETS[0],
        AP_IP_OCTETS[1],
        AP_IP_OCTETS[2],
        AP_IP_OCTETS[3],
    );
    ap_netif_cfg.ip_configuration = Some(ipv4::Configuration::Router(RouterConfiguration {
        subnet: Subnet {
            gateway: gateway_ip,
            mask: Mask(AP_SUBNET_PREFIX),
        },
        dhcp_enabled: true,
        dns: None,
        ..Default::default()
    }));
    let ap_netif = EspNetif::new_with_conf(&ap_netif_cfg)?;

    let esp_wifi = EspWifi::wrap_all(driver, sta_netif, ap_netif)?;
    let mut wifi = BlockingWifi::wrap(esp_wifi, sys_loop)?;

    let wifi_config = WifiConfig::AccessPoint(AccessPointConfiguration {
        ssid: WIFI_SSID
            .try_into()
            .map_err(|_| anyhow::anyhow!("AP SSID melebihi batas panjang"))?,
        ssid_hidden: false,
        auth_method: AuthMethod::WPA2Personal,
        password: WIFI_PASS
            .try_into()
            .map_err(|_| anyhow::anyhow!("AP password melebihi batas panjang"))?,
        channel: WIFI_CHANNEL,
        max_connections: WIFI_MAX_CONNECTIONS,
        ..Default::default()
    });

    wifi.set_configuration(&wifi_config)?;
    wifi.start()?;
    wifi.wait_netif_up()?;

    let ip_info = wifi.wifi().ap_netif().get_ip_info()?;
    let ap_mac = wifi.wifi().ap_netif().get_mac()?;
    info!(
        "[NET] SoftAP aktif | SSID={} | Channel={} | IP={} | Subnet={} | MAC={} | Dashboard=http://{}",
        WIFI_SSID,
        WIFI_CHANNEL,
        ip_info.ip,
        ip_info.subnet.mask,
        format_mac(ap_mac),
        ip_info.ip
    );

    let server_cfg = HttpConfig {
        stack_size: HTTP_STACK_SIZE,
        max_open_sockets: 7,
        lru_purge_enable: true,
        session_timeout: Duration::from_secs(60),
        ..Default::default()
    };
    let mut server = EspHttpServer::new(&server_cfg)?;

    server.fn_handler::<anyhow::Error, _>("/", Method::Get, |req| {
        let mut resp = req.into_response(
            200,
            Some("OK"),
            &[
                ("Content-Type", "text/html; charset=utf-8"),
                ("Content-Encoding", "gzip"),
                ("Cache-Control", "no-store"),
                ("Connection", "close"),
            ],
        )?;
        resp.write_all(INDEX_HTML_GZ)?;
        Ok(())
    })?;

    let state_ws = Arc::clone(&shared_state);
    let registry_ws = Arc::clone(&ws_registry);
    server.ws_handler("/ws", None, move |ws| {
        let session_id = ws.session();

        if ws.is_new() {
            // Jangan panggil DetachedSender::send() di dalam thread httpd (ws_handler)
            // karena httpd_queue_work + condvar.wait akan memicu self-deadlock pada server HTTP.
            match ws.create_detached_sender() {
                Ok(sender) => {
                    registry_ws.register(sender);
                }
                Err(err) => {
                    warn!("[WS] Gagal buat detached sender #{}: {:?}", session_id, err);
                }
            }
            return Ok::<(), esp_idf_svc::sys::EspError>(());
        }

        if ws.is_closed() {
            registry_ws.unregister(session_id);
            return Ok(());
        }

        let (frame_type, len) = match ws.recv(&mut []) {
            Ok(res) => res,
            Err(err) => {
                warn!("[WS] Error baca header frame #{}: {:?}", session_id, err);
                registry_ws.unregister(session_id);
                return Ok(());
            }
        };

        if len > 512 {
            warn!("[WS] Frame dari #{} terlalu besar ({} byte), diabaikan", session_id, len);
            let mut drain = vec![0u8; len.min(2048)];
            let _ = ws.recv(&mut drain);
            return Ok(());
        }

        let mut buf = [0u8; 512];
        if len > 0 {
            if let Err(err) = ws.recv(&mut buf[..len]) {
                warn!("[WS] Error baca payload frame #{}: {:?}", session_id, err);
                return Ok(());
            }
        }

        match frame_type {
            FrameType::Text(_) => {
                let raw_slice = &buf[..len];
                let trimmed = raw_slice.strip_suffix(&[0]).unwrap_or(raw_slice);
                let text = match CStr::from_bytes_until_nul(raw_slice) {
                    Ok(cstr) => cstr.to_str(),
                    Err(_) => core::str::from_utf8(trimmed),
                };
                match text {
                    Ok(json_str) => match ClientMessage::from_json(json_str) {
                        Ok(msg) => {
                            let mut state = lock_state(&state_ws);
                            state.apply_client_message(msg, Instant::now());
                        }
                        Err(err) => {
                            warn!("[WS] JSON invalid dari #{}: {} ({})", session_id, err, json_str);
                        }
                    },
                    Err(err) => {
                        warn!("[WS] Payload UTF-8 invalid dari #{}: {}", session_id, err);
                    }
                }
            }
            FrameType::Close | FrameType::SocketClose => {
                registry_ws.unregister(session_id);
            }
            FrameType::Ping | FrameType::Pong | FrameType::Continue(_) | FrameType::Binary(_) => {}
        }

        Ok(())
    })?;

    Ok(NetworkRuntime {
        _wifi: wifi,
        _server: server,
        _wifi_sub: wifi_sub,
        _ip_sub: ip_sub,
    })
}
