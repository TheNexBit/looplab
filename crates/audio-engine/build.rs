//! Compiles the Signalsmith Stretch C interface (MSVC is part of the Tauri prerequisites).
//! It is built with this crate's optimisation level, so it is fast in development too.

fn main() {
    println!("cargo::rerun-if-changed=cpp/stretch.cpp");
    println!("cargo::rerun-if-changed=vendor");

    cc::Build::new()
        .cpp(true)
        .std("c++14")
        .file("cpp/stretch.cpp")
        .include("vendor")
        // Vendored code is not ours to fix: keep the build output clean
        .warnings(false)
        .compile("looplab-stretch");
}
