// Cross-platform helper for the Python backend.
//   node scripts/backend.mjs install  -> creates backend/.venv and installs requirements
//   node scripts/backend.mjs dev      -> runs uvicorn on port 8000 (restart it after backend code changes)
import { spawnSync, spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const backend = join(root, "backend")
const venv = join(backend, ".venv")
const isWin = process.platform === "win32"
const venvPython = join(venv, isWin ? "Scripts" : "bin", isWin ? "python.exe" : "python")

function findSystemPython() {
  const candidates = isWin ? [["py", ["-3"]], ["python", []], ["python3", []]] : [["python3", []], ["python", []]]
  for (const [cmd, args] of candidates) {
    const r = spawnSync(cmd, [...args, "--version"], { stdio: "ignore" })
    if (r.status === 0) return [cmd, args]
  }
  console.error("Python 3 was not found. Install it from https://www.python.org/downloads/")
  process.exit(1)
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: backend })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

const mode = process.argv[2]

if (mode === "install") {
  if (!existsSync(venvPython)) {
    const [cmd, args] = findSystemPython()
    console.log("Creating virtual environment in backend/.venv ...")
    const r = spawnSync(cmd, [...args, "-m", "venv", venv], { stdio: "inherit" })
    if (r.status !== 0) process.exit(r.status ?? 1)
  }
  run(venvPython, ["-m", "pip", "install", "--upgrade", "pip"])
  run(venvPython, ["-m", "pip", "install", "-r", "requirements.txt"])
} else if (mode === "dev") {
  if (!existsSync(venvPython)) {
    console.error("Backend not installed yet. Run: npm run install-both")
    process.exit(1)
  }
  const child = spawn(
    venvPython,
    ["-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"],
    { stdio: "inherit", cwd: backend }
  )
  child.on("exit", (code) => process.exit(code ?? 0))
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig))
} else {
  console.error("Usage: node scripts/backend.mjs <install|dev>")
  process.exit(1)
}
