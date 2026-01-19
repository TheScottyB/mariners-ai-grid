import sys
from grpc_tools import protoc

def compile_proto():
    print("Compiling weather_seed.proto...")
    
    # Arguments for protoc
    # -I: Include path
    # --python_out: Output path for generated Python code
    # --mypy_out: Output path for generated Mypy stubs (for type checking)
    
    proto_file = "schema/weather_seed.proto"
    
    cmd = [
        "grpc_tools.protoc",
        "-I.",
        "--python_out=.",
        "--mypy_out=.",
        proto_file
    ]
    
    exit_code = protoc.main(cmd)
    
    if exit_code != 0:
        print("Error: Protobuf compilation failed.")
        sys.exit(exit_code)
        
    print(f"Success! Generated Python code for {proto_file}")

if __name__ == "__main__":
    compile_proto()
