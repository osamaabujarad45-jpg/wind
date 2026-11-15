#!/bin/sh
# /srv/azure-token.sh on the VM. Prints a short-lived token for the VM's managed identity, so nothing on disk holds a cloud secret.
#   azure-token.sh <resource>          an access token, for example https://storage.azure.com/ for the backup upload
#   azure-token.sh acr <registry>      a registry refresh token (about three hours) for docker login with the all-zero user name
# The identity's roles decide what a token can do: AcrPull on the registry, "Wind backup writer" (create only) on wind-backups.
set -eu
imds() {
  curl -fsS -m 10 -H Metadata:true "http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=$1" | jq -er .access_token
}
case "${1:-}" in
  acr)
    # Only an Azure registry name: the exchange sends the identity's token to this host.
    case "${2:-}" in *[!a-z0-9.-]*|'') echo "usage: azure-token.sh acr <name>.azurecr.io" >&2; exit 2 ;; *.azurecr.io) ;; *) echo "not an Azure registry: $2" >&2; exit 2 ;; esac
    aad=$(imds https://management.azure.com/)
    # The token goes in on stdin, not the command line, so it never shows in the process list.
    printf 'grant_type=access_token&service=%s&access_token=%s' "$2" "$aad" \
      | curl -fsS -m 20 --data-binary @- "https://$2/oauth2/exchange" | jq -er .refresh_token ;;
  https://*) imds "$1" ;;
  *) echo "usage: azure-token.sh <https resource> | acr <registry>" >&2; exit 2 ;;
esac
