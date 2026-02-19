# Samizdat build targets
# Usage:
#   make          — incremental build (bundle JS + Flutter run)
#   make clean    — remove all build artifacts for a full rebuild
#   make bundle   — re-bundle the Bare JS worklet only
#   make native   — rebuild the native C bridge only
#   make run      — bundle JS + run the macOS app
#   make release  — build a signed + notarized macOS DMG locally
#   make dmg      — build a signed DMG without notarizing
#   make web      — build the Flutter web app
#   make archiver — run the web archiver server
#   make archiver-install — install archiver npm dependencies

BARE_DIR       := bare
ASSETS_DIR     := assets/bare
NATIVE_DIR     := native
DIST_DIR       := dist
NOTARY_PROFILE ?= samizdat

.PHONY: all run bundle native clean dmg release web archiver archiver-install

all: bundle
	flutter run -d macos

run: bundle
	flutter run -d macos

bundle:
	cd $(BARE_DIR) && npm run bundle
	cp $(BARE_DIR)/bundle.js $(ASSETS_DIR)/bundle.js

native:
	bash $(NATIVE_DIR)/build_macos.sh

dmg: bundle
	fastforge release --name release --jobs macos-dmg
	@echo "DMG built: $$(ls $(DIST_DIR)/*.dmg)"

release: dmg
	$(eval DMG := $(shell ls $(DIST_DIR)/*.dmg))
	xcrun notarytool submit $(DMG) --keychain-profile $(NOTARY_PROFILE) --wait
	xcrun stapler staple $(DMG)
	@echo "Signed + notarized DMG ready: $(DMG)"

# --- Web archiver ---
web:
	flutter build web --target lib/web/main.dart --output build/web

archiver:
	cd archiver && npm start

archiver-install:
	cd archiver && npm install && npm rebuild better-sqlite3

clean:
	# Flutter build artifacts
	flutter clean
	# Bare JS bundle
	rm -f $(BARE_DIR)/bundle.js
	rm -f $(ASSETS_DIR)/bundle.js
	# Native bridge build
	rm -rf $(NATIVE_DIR)/build
	# Xcode derived data (macOS)
	rm -rf build
	# Release artifacts
	rm -rf $(DIST_DIR)
	# Archiver data
	rm -rf archiver/data
	@echo "Clean complete. Run 'make' to do a full rebuild."
