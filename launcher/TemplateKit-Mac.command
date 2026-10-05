#!/bin/sh
# 템플릿킷 실행기 (macOS) - 더블클릭하면 앱 창으로 열립니다.
# (처음 한 번은 우클릭 → 열기 로 실행해야 할 수 있습니다.)
URL="https://tlsgusdlf33.github.io/A13/"
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app="$URL"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
  open -na "Microsoft Edge" --args --app="$URL"
else
  open "$URL"
fi
