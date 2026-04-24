const path = require('node:path')
const { copyFile } = require('node:fs/promises')
const { createWindowsInstaller } = require('electron-winstaller')

async function buildInstaller() {
  const rootDir = path.resolve(__dirname, '..')
  const releaseDir = path.join(rootDir, 'release')
  const unpackedDir = path.join(releaseDir, 'win-unpacked')
  const iconPath = path.join(rootDir, 'build', 'icon.ico')

  await copyFile(path.join(rootDir, 'LICENSE'), path.join(unpackedDir, 'LICENSE'))

  await createWindowsInstaller({
    appDirectory: unpackedDir,
    outputDirectory: path.join(releaseDir, 'windows-installer'),
    exe: 'LED Ekranu Skaiciuokle.exe',
    setupExe: 'LED-Ekranu-Skaiciuokle-Setup.exe',
    name: 'led_skaiciuokle',
    title: 'LED Ekranu Skaiciuokle',
    description: 'LED ekranu skaiciuokle ir perziuros programa',
    authors: 'stoga',
    setupIcon: iconPath,
    noMsi: true,
  })
}

buildInstaller().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
