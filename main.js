const { app, BrowserWindow } = require('electron')
const express = require('express')
const path = require('path')
const fs = require('fs')

let win, server

function getAppPath() {
  if (app.isPackaged) {
    return path.join(path.dirname(process.execPath), 'resources', 'app')
  }
  return __dirname
}

function startServer() {
  const appPath = getAppPath()
  const userDataPath = app.getPath('userData')
  const FILE = path.join(userDataPath, 'data.json')

  // Si no existe en AppData, copia el de la app
  if (!fs.existsSync(FILE)) {
    const defaultFile = path.join(appPath, 'data.json')
    if (fs.existsSync(defaultFile)) {
      fs.copyFileSync(defaultFile, FILE)
    } else {
      fs.writeFileSync(FILE, JSON.stringify({ loans: [], movs: [] }, null, 2))
    }
  }

  const expressApp = express()
  expressApp.use(express.json())
  expressApp.use(express.static(appPath))

  expressApp.get('/', (req, res) => {
    res.sendFile(path.join(appPath, 'index.html'))
  })

  expressApp.get('/data', (req, res) => {
    const data = JSON.parse(fs.readFileSync(FILE))
    res.json(data)
  })

  expressApp.post('/data', (req, res) => {
    fs.writeFileSync(FILE, JSON.stringify(req.body, null, 2))
    res.json({ ok: true })
  })

  return new Promise((resolve) => {
    server = expressApp.listen(3000, () => {
      console.log('Servidor en http://localhost:3000')
      resolve()
    })
  })
}

app.whenReady().then(async () => {
  await startServer()
  win = new BrowserWindow({ width: 900, height: 700, show: false })
  win.maximize()
  win.loadURL('http://localhost:3000')
  win.show()
})

app.on('quit', () => {
  if (server) server.close()
})