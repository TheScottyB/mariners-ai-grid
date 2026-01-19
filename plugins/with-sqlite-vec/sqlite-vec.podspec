Pod::Spec.new do |s|
  s.name         = "sqlite-vec"
  s.version      = "0.1.6"
  s.summary      = "Vector search for SQLite"
  s.description  = <<-DESC
    sqlite-vec is a SQLite extension for vector search.
  DESC
  s.homepage     = "https://github.com/asg017/sqlite-vec"
  s.license      = "MIT"
  s.author       = { "Alex Garcia" => "alex@asg.com" }
  s.platform     = :ios, "13.0"
  s.source       = { :git => "https://github.com/asg017/sqlite-vec.git", :tag => "v#{s.version}" }

  # Use XCFramework for proper multi-arch support (Apple Silicon Simulators)
  s.vendored_frameworks = 'vendor/ios/sqlite_vec.xcframework'
  
  # Ensure library is loaded - use static frameworks for proper linking
  s.static_framework = true
  s.library = 'c++'
  
  s.dependency 'ExpoSQLite'
end
