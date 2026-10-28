#!/usr/bin/env bash
#
# Drive the Android dev client on a phone attached over (wireless) adb.
# Run via `just phone <cmd>` from mobile/. Every command stays inside our
# package: no device-wide dumpsys, and dumps are filtered to our app's nodes.

set -euo pipefail

PKG=$(node -p 'require("./app.json").expo.android.package')
SCHEME=$(node -p 'require("./app.json").expo.scheme')
# Where expo-dev-client (SDK 58) caches the JS bundle it downloaded from Metro.
# An internal name: if `has` can't read it after an SDK bump, find the new one
# with `adb shell run-as <pkg> ls files`.
BUNDLE=files/DevLauncherApp-BridgelessReactNativeDevBundle.js
DUMP=/sdcard/movienight-ui.xml
LAUNCH_TIMEOUT=60

die() { echo "phone: $*" >&2; exit 2; }

usage() {
  cat >&2 <<'EOF'
usage: just phone <cmd>
  launch [port]   force-stop, open the dev client against http://<lan-ip>:<port>
                  (default 8081), and wait until the app has loaded
  tap "<text>"    tap the centre of the first element whose text matches exactly
  dump            list visible text with bounds
  shot <file>     save a screenshot (PNG)
  has <text>      exit 0 if <text> is in the phone's downloaded JS bundle,
                  1 if not: the "is my change on the phone?" check
EOF
  exit 2
}

# lan_ip prints the dev machine's address on the route to the phone's Wi-Fi
# address (not the default route, which a VPN or container bridge can own).
lan_ip() {
  local phone
  phone=$(adb shell ip -4 -o addr show wlan0 | grep -oP 'inet \K[0-9.]+') \
    || die "can't find the phone's Wi-Fi address (is it on Wi-Fi?)"
  ip -4 route get "$phone" | grep -oP 'src \K\S+' || die "no route to the phone at $phone"
}

# nodes prints one "text<TAB>bounds" line per text-bearing node of our app,
# in screen (document) order. uiautomator escapes XML entities in attributes;
# unescape the common ones so `tap` matches what's on screen.
nodes() {
  adb shell uiautomator dump "$DUMP" >/dev/null 2>&1 || die "uiautomator dump failed (screen off or locked?)"
  adb exec-out cat "$DUMP" \
    | grep -oP '<node [^>]*>' \
    | { grep -F "package=\"$PKG\"" || true; } \
    | sed -nE 's/.* text="([^"]+)".* bounds="([^"]+)".*/\1\t\2/p' \
    | sed -e 's/&#10;/ /g' -e 's/&#9;/ /g' -e 's/&quot;/"/g' -e "s/&apos;/'/g" \
      -e 's/&lt;/</g' -e 's/&gt;/>/g' -e 's/&amp;/\&/g'
}

cmd_launch() {
  local port=${1:-8081} url prev="" cur deadline
  url="http://$(lan_ip):$port"
  adb shell am force-stop "$PKG"
  adb shell am start -a android.intent.action.VIEW \
    -d "$SCHEME://expo-development-client/?url=$(sed -e 's/:/%3A/g' -e 's#/#%2F#g' <<<"$url")" \
    "$PKG" >/dev/null
  echo "phone: opened $url, waiting for the app to load..." >&2
  # Loaded = our app shows text beyond the dev client's floating "Tools"
  # button, and it's unchanged across two polls (no splash or progress text).
  deadline=$((SECONDS + LAUNCH_TIMEOUT))
  while ((SECONDS < deadline)); do
    cur=$(nodes 2>/dev/null | cut -f1 | grep -vxF Tools || true)
    # The dev launcher's error screen is in our package too.
    if grep -qxF "There was a problem loading the project." <<<"$cur"; then
      die "dev client couldn't load $url: $(sed -n 3p <<<"$cur" | cut -c1-120)"
    fi
    if [[ -n "$cur" && "$cur" == "$prev" ]]; then
      echo "phone: loaded" >&2
      return 0
    fi
    prev=$cur
    sleep 1
  done
  die "app didn't settle within ${LAUNCH_TIMEOUT}s (screen off or locked? check with: just phone shot <file>)"
}

cmd_tap() {
  [[ $# -eq 1 ]] || usage
  local bounds x1 y1 x2 y2
  bounds=$(nodes | awk -F'\t' -v t="$1" '$1 == t { print $2; exit }')
  [[ -n "$bounds" ]] || die "no element with text \"$1\" (try: just phone dump)"
  read -r x1 y1 x2 y2 <<<"${bounds//[^0-9]/ }"
  adb shell input tap $(((x1 + x2) / 2)) $(((y1 + y2) / 2))
}

cmd_dump() {
  nodes | awk -F'\t' '{ printf "%-24s %s\n", $2, $1 }'
}

cmd_shot() {
  [[ $# -eq 1 ]] || usage
  adb exec-out screencap -p >"$1"
  echo "$1"
}

cmd_has() {
  [[ $# -eq 1 ]] || usage
  local status=0
  # exec-out doesn't pass on run-as failures, so a missing bundle would look
  # like "not found" without this check.
  adb shell run-as "$PKG" test -s "$BUNDLE" \
    || die "couldn't read the bundle (is the dev client installed and launched once?)"
  # Can't pipe into grep -q: it exits on the first match, SIGPIPE-ing adb.
  adb exec-out run-as "$PKG" cat "$BUNDLE" | grep -cF -- "$1" >/dev/null || status=$?
  case $status in
    0) echo "phone: found in bundle" >&2 ;;
    1) echo "phone: NOT in bundle; run 'just start-clean' and 'just phone launch'" >&2 ;;
    *) die "grep failed reading the bundle" ;;
  esac
  return "$status"
}

[[ $# -ge 1 ]] || usage
cmd=$1
shift
case $cmd in
  launch | tap | dump | shot | has) "cmd_$cmd" "$@" ;;
  *) usage ;;
esac
