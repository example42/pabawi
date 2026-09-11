require 'bundler/setup'
require 'json'

specs = Bundler.load.specs.sort_by(&:name).map do |spec|
  { name: spec.name, version: spec.version.to_s, platform: spec.platform.to_s }
end
puts JSON.pretty_generate(specs)
