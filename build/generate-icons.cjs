const path = require('node:path')
const { mkdir, writeFile } = require('node:fs/promises')
const { PNG } = require('pngjs')
const pngToIcoModule = require('png-to-ico')
const pngToIco = typeof pngToIcoModule === 'function' ? pngToIcoModule : pngToIcoModule.default || pngToIcoModule

function fillRect(png, x, y, width, height, color) {
  for (let currentY = y; currentY < y + height; currentY += 1) {
    for (let currentX = x; currentX < x + width; currentX += 1) {
      const index = (png.width * currentY + currentX) << 2
      png.data[index] = color[0]
      png.data[index + 1] = color[1]
      png.data[index + 2] = color[2]
      png.data[index + 3] = color[3]
    }
  }
}

async function generateIcons() {
  const buildDir = __dirname
  const size = 256
  const png = new PNG({ width: size, height: size })

  fillRect(png, 0, 0, size, size, [15, 23, 42, 255])
  fillRect(png, 16, 16, size - 32, size - 32, [24, 24, 27, 255])

  const gridSize = 4
  const moduleSize = 42
  const gap = 10
  const totalGridSize = gridSize * moduleSize + (gridSize - 1) * gap
  const startX = Math.round((size - totalGridSize) / 2)
  const startY = Math.round((size - totalGridSize) / 2)

  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      const x = startX + column * (moduleSize + gap)
      const y = startY + row * (moduleSize + gap)
      const color = (row + column) % 2 === 0 ? [234, 88, 12, 255] : [126, 34, 206, 255]
      fillRect(png, x, y, moduleSize, moduleSize, color)
    }
  }

  fillRect(png, startX + 64, startY + 64, totalGridSize - 128, 10, [255, 255, 255, 255])
  fillRect(png, startX + 64, startY + 64, 10, totalGridSize - 128, [255, 255, 255, 255])

  await mkdir(buildDir, { recursive: true })

  const pngPath = path.join(buildDir, 'icon.png')
  const icoPath = path.join(buildDir, 'icon.ico')
  const pngBuffer = PNG.sync.write(png)

  await writeFile(pngPath, pngBuffer)
  await writeFile(icoPath, await pngToIco(pngPath))
}

generateIcons().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
