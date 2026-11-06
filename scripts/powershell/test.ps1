# ===================================================================
#  Controlli automatici, da lanciare prima di ogni commit o build:
#  1. Biome        stile e errori comuni del codice TypeScript
#  2. TypeScript   errori di tipo
#  3. Vitest       test dell'interfaccia
#  4. rustfmt      formattazione del codice Rust
#  5. Clippy       qualita del codice Rust (ogni warning = errore)
#  6. cargo test   test del motore audio e dell'app
#  Si ferma al primo controllo che fallisce.
# ===================================================================
. "$PSScriptRoot\config.ps1"
$Host.UI.RawUI.WindowTitle = 'Looplab - test'

Invoke-Step '1/6 Biome' { npx biome check . }
Invoke-Step '2/6 TypeScript' { npx tsc --noEmit }
Invoke-Step '3/6 Vitest' { npx vitest run }
Invoke-Step '4/6 rustfmt' { cargo fmt --all -- --check }
Invoke-Step '5/6 Clippy' { cargo clippy --workspace --all-targets -- -D warnings }
Invoke-Step '6/6 cargo test' { cargo test --workspace }

Write-Host "`nTutti i controlli superati." -ForegroundColor Green
