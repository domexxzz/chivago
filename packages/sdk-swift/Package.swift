// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "ChivaGo",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [
        .library(name: "ChivaGo", targets: ["ChivaGo"]),
    ],
    targets: [
        .target(name: "ChivaGo"),
        .testTarget(
            name: "ChivaGoTests",
            dependencies: ["ChivaGo"],
            // Real captured server responses, not hand-written fixtures.
            resources: [.copy("api-samples.json")]
        ),
    ]
)
