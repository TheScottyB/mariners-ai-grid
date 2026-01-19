import sys
import os
from grpc_tools import protoc

def compile_proto_ts():
    print("Compiling weather_seed.proto to TypeScript...")
    
    # Path to ts-proto plugin
    # On macOS/Linux, it's usually in node_modules/.bin/protoc-gen-ts_proto
    plugin_path = os.path.abspath("../node_modules/.bin/protoc-gen-ts_proto")
    
    if not os.path.exists(plugin_path):
        # Try without .bin or check if it's .cmd on windows
        plugin_path = os.path.abspath("../node_modules/ts-proto/protoc-gen-ts_proto")
    
    proto_file = "schema/weather_seed.proto"
    out_dir = "../src/schema"
    
    if not os.path.exists(out_dir):
        os.makedirs(out_dir)

    # protoc arguments for TypeScript
    # --plugin: specifies the path to the ts-proto plugin
    # --ts_proto_out: output directory for TS
    # --ts_proto_opt: options for ts-proto (esModuleInterop, outputJsonMethods, etc.)
    
    cmd = [
        "grpc_tools.protoc",
        "-I.",
        f"--plugin=protoc-gen-ts_proto={plugin_path}",
        f"--ts_proto_out={out_dir}",
        "--ts_proto_opt=esModuleInterop=true,outputJsonMethods=false,env=browser",
        proto_file
    ]
    
    print(f"Running: {' '.join(cmd)}")
    exit_code = protoc.main(cmd)
    
    if exit_code != 0:
        print("Error: Protobuf TS compilation failed.")
        sys.exit(exit_code)
        
    print(f"Success! Generated TypeScript types in {out_dir}")

if __name__ == "__main__":
    compile_proto_ts()
