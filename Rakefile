require 'opal'

task :default => :build

desc "Build our app to build.js"
task :build do
  sh "erb hello_world.js.opal.erb > hello_world.rb"
  #sh "opal hello_world.js.opal > hello_world.js"

  env = Opal::Environment.new
  env.append_path "."

  File.open("build.js", "w+") do |out|
    out << env["hello_world"].to_s
  end
end
