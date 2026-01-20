#!/bin/bash

# Pabawi Certificate Generation Script
# This script generates a Certificate Signing Request (CSR) for Puppetserver API access.

set -euo pipefail

# Default configuration
DEFAULT_CERTNAME="pabawi"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/backend/.env"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Generate a Certificate Signing Request (CSR) for Puppetserver API access.

OPTIONS:
    -c, --certname NAME     Certificate name (default: $DEFAULT_CERTNAME)
    -d, --download          Download signed certificate after generation
    -h, --help              Show this help message
    --dry-run               Show what would be done without executing

ENVIRONMENT VARIABLES:
    PUPPETSERVER_SERVER_URL    Puppetserver URL (required)
    PUPPETSERVER_PORT          Puppetserver port (default: 8140)
    PUPPETSERVER_SSL_CA        Path to CA certificate
    PUPPETSERVER_SSL_CERT      Path to client certificate (for existing auth)
    PUPPETSERVER_SSL_KEY       Path to client private key (for existing auth)

EXAMPLES:
    # Generate CSR with default certname 'pabawi'
    $0

    # Generate CSR with custom certname
    $0 --certname myapp

    # Generate and download signed certificate
    $0 --download

    # Show what would be done
    $0 --dry-run

WORKFLOW:
    1. Run this script to generate CSR and submit to Puppetserver (uses -k flag for SSL)
    2. Sign the certificate on Puppetserver: puppetserver ca sign --certname <certname>
    3. Run with --download to retrieve signed certificate
    4. Update .env file with certificate paths (done automatically)

NOTE:
    The script uses curl -k (skip SSL verification) when submitting CSRs since
    Puppetserver uses its own CA. For downloads, it will use the CA certificate
    if available, otherwise it will skip verification.

EOF
}

# Function to load environment variables
load_env() {
    if [[ -f "$ENV_FILE" ]]; then
        print_status "Loading environment from $ENV_FILE"
        # Export variables from .env file
        set -a
        # shellcheck source=/dev/null
        source "$ENV_FILE"
        set +a
    else
        print_warning ".env file not found at $ENV_FILE"
    fi
}

# Function to validate required environment variables
validate_env() {
    if [[ -z "${PUPPETSERVER_SERVER_URL:-}" ]]; then
        print_error "PUPPETSERVER_SERVER_URL is required"
        print_error "Please set it in $ENV_FILE or as an environment variable"
        exit 1
    fi

    # Set default port if not specified
    PUPPETSERVER_PORT="${PUPPETSERVER_PORT:-8140}"

    print_status "Using Puppetserver: $PUPPETSERVER_SERVER_URL:$PUPPETSERVER_PORT"
}

# Function to get certificate paths from environment
get_cert_paths() {
    local certname="$1"

    # Use configured paths from environment variables
    CERT_FILE="${PUPPETSERVER_SSL_CERT:-}"
    KEY_FILE="${PUPPETSERVER_SSL_KEY:-}"
    CA_FILE="${PUPPETSERVER_SSL_CA:-}"

    # If paths are not configured, fall back to default structure
    if [[ -z "$CERT_FILE" ]]; then
        CERT_FILE="$PROJECT_ROOT/certs/${certname}.pem"
    fi

    if [[ -z "$KEY_FILE" ]]; then
        KEY_FILE="$PROJECT_ROOT/certs/private/${certname}.pem"
    fi

    if [[ -z "$CA_FILE" ]]; then
        CA_FILE="$PROJECT_ROOT/certs/ca.pem"
    fi

    print_status "Certificate paths:"
    print_status "  Certificate: $CERT_FILE"
    print_status "  Private Key: $KEY_FILE"
    print_status "  CA Certificate: $CA_FILE"
}

# Function to create certificate directories based on configured paths
create_cert_dirs() {
    local certname="$1"

    # Get paths from environment
    get_cert_paths "$certname"

    if [[ "$DRY_RUN" == "true" ]]; then
        print_status "[DRY RUN] Would create directories for certificate paths"
        return
    fi

    # Create directories for certificate files
    local cert_dir
    local key_dir
    local ca_dir
    cert_dir=$(dirname "$CERT_FILE")
    key_dir=$(dirname "$KEY_FILE")
    ca_dir=$(dirname "$CA_FILE")

    mkdir -p "$cert_dir" "$key_dir" "$ca_dir"

    # Secure private key directory
    chmod 700 "$key_dir"

    print_status "Created certificate directories"
}

# Function to generate private key
generate_private_key() {
    local certname="$1"

    if [[ "$DRY_RUN" == "true" ]]; then
        print_status "[DRY RUN] Would generate private key: $KEY_FILE"
        return
    fi

    if [[ -f "$KEY_FILE" ]]; then
        print_warning "Private key already exists: $KEY_FILE"
        read -p "Overwrite? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_status "Using existing private key"
            return
        fi
    fi

    print_status "Generating private key..."
    openssl genrsa -out "$KEY_FILE" 4096
    chmod 600 "$KEY_FILE"
    print_success "Private key generated: $KEY_FILE"
}

# Function to create OpenSSL configuration
create_openssl_config() {
    local certname="$1"
    local config_file
    config_file="$(dirname "$CERT_FILE")/${certname}.conf"

    if [[ "$DRY_RUN" == "true" ]]; then
        print_status "[DRY RUN] Would create OpenSSL config: $config_file"
        return
    fi

    cat > "$config_file" << EOF
[req]
distinguished_name = req_distinguished_name
prompt = no

[req_distinguished_name]
CN = $certname
EOF

    print_success "OpenSSL configuration created: $config_file"
    CONFIG_FILE="$config_file"
}

# Function to generate CSR
generate_csr() {
    local certname="$1"
    local csr_file
    csr_file="$(dirname "$CERT_FILE")/${certname}.csr"

    if [[ "$DRY_RUN" == "true" ]]; then
        print_status "[DRY RUN] Would generate CSR: $csr_file"
        return
    fi

    print_status "Generating Certificate Signing Request..."
    openssl req -new -key "$KEY_FILE" -out "$csr_file" -config "$CONFIG_FILE"
    print_success "CSR generated: $csr_file"
    CSR_FILE="$csr_file"
}

# Function to submit CSR to Puppetserver
submit_csr() {
    local certname="$1"
    local url="$PUPPETSERVER_SERVER_URL:$PUPPETSERVER_PORT/puppet-ca/v1/certificate_request/$certname"

    if [[ "$DRY_RUN" == "true" ]]; then
        print_status "[DRY RUN] Would submit CSR to: $url"
        return
    fi

    print_status "Submitting CSR to Puppetserver..."

    # Build curl command with SSL options
    local curl_cmd="curl -X PUT"
    curl_cmd+=" -H 'Content-Type: text/plain'"
    curl_cmd+=" --data-binary @$CSR_FILE"

    # Add SSL options if available
    if [[ -n "${PUPPETSERVER_SSL_CA:-}" ]] && [[ -f "${PUPPETSERVER_SSL_CA}" ]]; then
        curl_cmd+=" --cacert $PUPPETSERVER_SSL_CA"
    fi

    if [[ -n "${PUPPETSERVER_SSL_CERT:-}" ]] && [[ -f "${PUPPETSERVER_SSL_CERT}" ]]; then
        curl_cmd+=" --cert $PUPPETSERVER_SSL_CERT"
    fi

    if [[ -n "${PUPPETSERVER_SSL_KEY:-}" ]] && [[ -f "${PUPPETSERVER_SSL_KEY}" ]]; then
        curl_cmd+=" --key $PUPPETSERVER_SSL_KEY"
    fi

    # Always skip certificate validation when submitting CSR
    # since we don't have the CA certificate yet or it's self-signed
    curl_cmd+=" -k"

    curl_cmd+=" $url"

    print_status "Executing: $curl_cmd"

    if eval "$curl_cmd"; then
        print_success "CSR submitted successfully"
        print_status ""
        print_status "Next steps:"
        print_status "1. Sign the certificate on Puppetserver:"
        print_status "   puppetserver ca sign --certname $certname"
        print_status ""
        print_status "2. Download the signed certificate:"
        print_status "   $0 --certname $certname --download"
    else
        print_error "Failed to submit CSR"
        print_error "Check Puppetserver connectivity and authentication"
        exit 1
    fi
}

# Function to download signed certificate
download_certificate() {
    local certname="$1"
    local url="$PUPPETSERVER_SERVER_URL:$PUPPETSERVER_PORT/puppet-ca/v1/certificate/$certname"

    if [[ "$DRY_RUN" == "true" ]]; then
        print_status "[DRY RUN] Would download certificate from: $url"
        return
    fi

    print_status "Downloading signed certificate..."

    # Build curl command
    local curl_cmd="curl -o $CERT_FILE"

    # Add SSL options if available
    if [[ -n "${PUPPETSERVER_SSL_CA:-}" ]] && [[ -f "${PUPPETSERVER_SSL_CA}" ]]; then
        curl_cmd+=" --cacert $PUPPETSERVER_SSL_CA"
    fi

    if [[ -n "${PUPPETSERVER_SSL_CERT:-}" ]] && [[ -f "${PUPPETSERVER_SSL_CERT}" ]]; then
        curl_cmd+=" --cert $PUPPETSERVER_SSL_CERT"
    fi

    if [[ -n "${PUPPETSERVER_SSL_KEY:-}" ]] && [[ -f "${PUPPETSERVER_SSL_KEY}" ]]; then
        curl_cmd+=" --key $PUPPETSERVER_SSL_KEY"
    fi

    # Add reject unauthorized option (for downloading, we might have CA cert)
    if [[ "${PUPPETSERVER_SSL_REJECT_UNAUTHORIZED:-true}" == "false" ]]; then
        curl_cmd+=" -k"
    elif [[ -z "${PUPPETSERVER_SSL_CA:-}" ]] || [[ ! -f "${PUPPETSERVER_SSL_CA}" ]]; then
        # If no CA cert available, skip validation
        curl_cmd+=" -k"
    fi

    curl_cmd+=" $url"

    if eval "$curl_cmd"; then
        print_success "Certificate downloaded: $CERT_FILE"

        # Download CA certificate if it doesn't exist
        download_ca_certificate

        # Verify the certificate
        verify_certificate "$certname"

        print_success "Certificate setup completed successfully!"
    else
        print_error "Failed to download certificate"
        print_error "Make sure the certificate has been signed on Puppetserver"
        exit 1
    fi
}

# Function to download CA certificate
download_ca_certificate() {
    if [[ -f "$CA_FILE" ]]; then
        print_status "CA certificate already exists: $CA_FILE"
        return
    fi

    print_status "Downloading CA certificate..."
    local ca_url="$PUPPETSERVER_SERVER_URL:$PUPPETSERVER_PORT/puppet-ca/v1/certificate/ca"

    # Build curl command for CA download
    local curl_cmd="curl -o $CA_FILE -k $ca_url"

    if eval "$curl_cmd"; then
        print_success "CA certificate downloaded: $CA_FILE"
    else
        print_warning "Failed to download CA certificate, but client certificate was downloaded successfully"
    fi
}

# Function to verify certificate
verify_certificate() {
    local certname="$1"

    if [[ "$DRY_RUN" == "true" ]]; then
        print_status "[DRY RUN] Would verify certificate: $CERT_FILE"
        return
    fi

    print_status "Verifying certificate..."

    # Check if certificate file exists and is valid
    if [[ ! -f "$CERT_FILE" ]]; then
        print_error "Certificate file not found: $CERT_FILE"
        return 1
    fi

    # Verify certificate format
    if ! openssl x509 -in "$CERT_FILE" -text -noout > /dev/null 2>&1; then
        print_error "Invalid certificate format"
        return 1
    fi

    print_success "✅ Certificate format is valid"

    # Verify private key matches certificate
    if [[ -f "$KEY_FILE" ]]; then
        local cert_modulus
        local key_modulus
        cert_modulus=$(openssl x509 -noout -modulus -in "$CERT_FILE" | openssl md5)
        key_modulus=$(openssl rsa -noout -modulus -in "$KEY_FILE" | openssl md5)

        if [[ "$cert_modulus" == "$key_modulus" ]]; then
            print_success "✅ Private key matches certificate"
        else
            print_error "❌ Private key does NOT match certificate"
            return 1
        fi
    fi

    # Show certificate details
    print_status "Certificate details:"
    openssl x509 -in "$CERT_FILE" -text -noout | grep -E "(Subject:|Issuer:|Not Before:|Not After:|DNS:)"
}

# Function to check if certificates already exist
check_existing_certificates() {
    local certname="$1"

    # Get paths from environment
    get_cert_paths "$certname"

    if [[ -f "$CERT_FILE" ]] && [[ -f "$KEY_FILE" ]]; then
        print_warning "Certificates already exist for certname: $certname"
        print_status "Certificate: $CERT_FILE"
        print_status "Private key: $KEY_FILE"

        if [[ "$DOWNLOAD_ONLY" != "true" ]]; then
            read -p "Overwrite existing certificates? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                print_status "Keeping existing certificates"
                exit 0
            fi
        fi
    fi
}

# Main function
main() {
    local certname="$DEFAULT_CERTNAME"
    local download_only=false
    local dry_run=false

    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -c|--certname)
                certname="$2"
                shift 2
                ;;
            -d|--download)
                download_only=true
                shift
                ;;
            --dry-run)
                dry_run=true
                shift
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done

    # Set global variables
    DOWNLOAD_ONLY="$download_only"
    DRY_RUN="$dry_run"

    print_status "Pabawi Certificate Generation Script"
    print_status "Certname: $certname"

    if [[ "$dry_run" == "true" ]]; then
        print_warning "DRY RUN MODE - No changes will be made"
    fi

    # Load environment and validate
    load_env
    validate_env

    # Check for existing certificates
    check_existing_certificates "$certname"

    if [[ "$download_only" == "true" ]]; then
        # Only download certificate
        download_certificate "$certname"
    else
        # Full process: generate CSR and submit
        create_cert_dirs "$certname"
        generate_private_key "$certname"
        create_openssl_config "$certname"
        generate_csr "$certname"
        submit_csr "$certname"
    fi

    print_success "Script completed successfully!"

    if [[ "$download_only" != "true" ]]; then
        print_status ""
        print_status "Remember to:"
        print_status "1. Sign the certificate on Puppetserver: puppetserver ca sign --certname $certname"
        print_status "2. Download the signed certificate: $0 --certname $certname --download"
        print_status "3. Restart your application to use the new certificate"
    fi
}

# Run main function with all arguments
main "$@"
