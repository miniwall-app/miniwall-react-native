require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "miniwall-react-native"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]
  s.platforms    = { :ios => "16.0" }
  s.source       = { :git => "https://github.com/miniwall-app/miniwall-react-native.git", :tag => "v#{s.version}" }
  s.source_files = "ios/**/*.{h,m,swift}"
  s.swift_version = "5.9"
  s.dependency "React-Core"
  s.dependency "MiniwallSDK", "~> 0.1"
end
