#!/usr/bin/env bash
# Regenere apps/web/next-env.d.ts par `next typegen` (D-048, D-050). `next typegen`
# charge next.config.ts, qui refuse de demarrer sans environnement serveur valide :
# on lui donne l'environnement de construction, comme scripts/ci-build.sh (meme
# liste blanche, garder les deux alignees), jamais celui du terminal. Les valeurs
# de ci/build.env sont inventees et versionnees. Appele par le script `typecheck`
# de apps/web : poste neuf, pre-push et CI passent par ici.
set -uo pipefail
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "ECHEC: depot git introuvable."; exit 1; }
cd "$ROOT" || exit 1
ENVF="ci/build.env"
[ -f "$ENVF" ] || { echo "ECHEC: $ENVF introuvable."; exit 1; }

# Variables du systeme, utiles a node, pnpm et git, sous Linux comme sous Windows.
KEEP='^(PATH|Path|HOME|USER|USERNAME|LOGNAME|SHELL|TERM|LANG|LANGUAGE|LC_[A-Z]+|TZ|TMPDIR|TEMP|TMP|SYSTEMROOT|SystemRoot|SYSTEMDRIVE|SystemDrive|WINDIR|windir|COMSPEC|ComSpec|PATHEXT|APPDATA|LOCALAPPDATA|USERPROFILE|HOMEDRIVE|HOMEPATH|PROGRAMFILES|ProgramFiles|PROGRAMDATA|ProgramData|ProgramW6432|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE|OS|PNPM_HOME|COREPACK_HOME|XDG_[A-Z_]+)$'
ARGS=()
while IFS= read -r -d '' kv; do
  name=${kv%%=*}
  [[ $name =~ $KEEP ]] && ARGS+=("$kv")
done < <(env -0)

# Variables de l'application : uniquement ci/build.env (NOM=valeur, une par ligne).
while IFS= read -r line || [ -n "$line" ]; do
  line=${line%$'\r'}
  case "$line" in ''|\#*) continue ;; esac
  [[ $line =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || { echo "ECHEC: ligne invalide dans $ENVF : ${line%%=*}"; exit 1; }
  ARGS+=("$line")
done < "$ENVF"

cd apps/web || exit 1
exec env -i "${ARGS[@]}" CI=true pnpm exec next typegen
