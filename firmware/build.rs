fn main() {
    println!("cargo:rerun-if-changed=../web/dist/index.html.gz");
    embuild::espidf::sysenv::output();
}
