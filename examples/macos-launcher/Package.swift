// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "BlastKit",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "BlastKit", targets: ["BlastKit"]),
        .library(name: "BlastPresenter", targets: ["BlastPresenter"]),
        .executable(name: "BlastLauncher", targets: ["BlastLauncher"]),
    ],
    targets: [
        .target(name: "BlastKit"),
        .target(name: "BlastPresenter", dependencies: ["BlastKit"]),
        .executableTarget(name: "BlastLauncher", dependencies: ["BlastKit", "BlastPresenter"]),
        .testTarget(name: "BlastKitTests", dependencies: ["BlastKit"]),
        .testTarget(name: "BlastPresenterTests", dependencies: ["BlastKit", "BlastPresenter"]),
        .testTarget(name: "BlastLauncherTests", dependencies: ["BlastKit", "BlastPresenter", "BlastLauncher"]),
    ]
)
