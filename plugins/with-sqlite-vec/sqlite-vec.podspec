Pod::Spec.new do |s|
  s.name         = "sqlite-vec"
  s.version      = "0.1.6"
  s.summary      = "Vector search for SQLite"
  s.description  = <<-DESC
                  sqlite-vec is a vector search extension for SQLite.
                  DESC
  s.homepage     = "https://github.com/asg017/sqlite-vec"
  s.license      = "MIT"
  s.author       = { "Alex Garcia" => "alex@asg017.com" }
  s.platform     = :ios, "13.0"
  s.source       = { :git => "https://github.com/asg017/sqlite-vec.git", :tag => "v#{s.version}" }

  # Use the source files downloaded by the config plugin
  s.source_files = "vendor/ios/sqlite-vec.{c,h}"
  s.public_header_files = "vendor/ios/sqlite-vec.h"
  
  # Compilation flags
  s.pod_target_xcconfig = { 
    'OTHER_CFLAGS' => '-DSQLITE_CORE -DSQLITE_ENABLE_FTS5',
    'CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES' => 'YES'
  }
end
