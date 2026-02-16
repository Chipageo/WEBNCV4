const express = require("express")
const expressStaticGzip = require("express-static-gzip")
const chalk = require("chalk")
let path = require("path")
const fs = require("fs")
const port = 8080
/*
 * Web Server for development
 * Web Socket server for development
 */
const wscolor = chalk.cyan
const expresscolor = chalk.green
const commandcolor = chalk.white
const WebSocket = require("ws")
let currentID = 0
const app = express()
const fileUpload = require("express-fileupload")
let sensorInterval = -1

const serverpath = path.normalize(__dirname + "/data") + "/"
if (!fs.existsSync(serverpath + "Flash")) {
    fs.mkdirSync(serverpath + "Flash", { recursive: true })
}
if (!fs.existsSync(serverpath + "SD")) {
    fs.mkdirSync(serverpath + "SD", { recursive: true })
}

const {
    commandsQuery,
    configURI,
    getLastconnection,
} = require(path.normalize(__dirname + "/targets/CNC/FluidNC/index.js"))

const WebSocketServer = require("ws").Server,
    wss = new WebSocketServer({ port: 8090 })
app.use("/", express.static(serverpath + "Flash"))
app.use("/sd", express.static(serverpath + "SD"))
app.use("/", expressStaticGzip(serverpath + "Flash"))
app.use(fileUpload({ preserveExtension: true, debug: false }))

app.listen(port, () => console.log("CNC/FluidNC Web UI Server running on port", port))
app.timeout = 2000

function SendWS(text, isbinary = true, isNotification = true) {
    if (typeof isbinary === "undefined") isbinary = true
    if (isbinary) {
        const array = new Uint8Array(text.length)
        for (let i = 0; i < array.length; ++i) {
            array[i] = text.charCodeAt(i)
        }
        wss.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(array)
            }
        })
    } else {
        const notif = (isNotification ? "NOTIFICATION:" : "") + text
        console.log(wscolor("[ws] send:", notif))
        wss.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(notif)
            }
        })
    }
}

app.get("/config", function (req, res) {
    configURI(req, res)
})

app.get("/command", function (req, res) {
    commandsQuery(req, res, SendWS)
})

function fileSizeString(size) {
    if (typeof size === "string") return size;
    if (size === -1) return ""
    const units = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"]
    let i = 0
    while (size >= 1024) {
        size /= 1024
        ++i
    }
    return `${size.toFixed(2)} ${units[i]}`
}

function filesList(mypath, destination) {
    const currentPath = path.normalize(serverpath + destination + mypath)
    console.log("[path]" + currentPath)
    const totalUsed = getTotalSize(serverpath + destination)
    const total = (destination == "SD" ? 4096 : 1.31) * 1024 * 1024
    const occupation = ((100 * totalUsed) / total).toFixed(0)

    const files = fs.readdirSync(currentPath).map((file) => {
        const fullpath = path.normalize(currentPath + "/" + file)
        const fst = fs.statSync(fullpath)
        const fsize = fst.isFile() ? fst.size : -1
        return { name: file, size: fsize, "datetime": fst.mtime.toISOString() }
    })

    const response = {
        files,
        path: mypath,
        occupation,
        status: "ok",
        total: fileSizeString(total),
        used: fileSizeString(totalUsed),
    }

    return JSON.stringify(response)
}

const getAllFiles = function (dirPath, arrayOfFiles = []) {
    let files = fs.readdirSync(dirPath) || []
    const newFiles = files.reduce((acc, file) => {
        const fullpath = dirPath + "/" + file
        return fs.statSync(fullpath).isDirectory()
            ? getAllFiles(fullpath, acc)
            : [...acc, fullpath]
    }, [])
    return [...arrayOfFiles, ...newFiles]
}

const getTotalSize = function (directoryPath) {
    const allFiles = getAllFiles(directoryPath)
    return allFiles.reduce(
        (acc, currFile) => acc + fs.statSync(currFile).size,
        0
    )
}

function deleteFolderRecursive(folderPath) {
    if (fs.existsSync(folderPath) && fs.lstatSync(folderPath).isDirectory()) {
        fs.readdirSync(folderPath).forEach(function (file) {
            let curPath = folderPath + "/" + file
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderRecursive(curPath)
            } else {
                fs.unlinkSync(curPath)
            }
        })
        console.log(`[server]Deleting directory "${folderPath}"...`)
        if (fs.existsSync(folderPath)) fs.rmdirSync(folderPath)
    } else console.log(`[server]No directory "${folderPath}"...`)
}

app.all("/updatefw", function (req, res) {
    res.send("ok")
})

app.all("/files", function (req, res) {
    let mypath = req.query.path
    let url = req.originalUrl
    let filepath = path.normalize(
        serverpath + "Flash" + mypath + "/" + req.query.filename
    )
    if (url.indexOf("action=deletedir") != -1) {
        console.log("[server]delete directory " + filepath)
        deleteFolderRecursive(filepath)
        fs.readdirSync(mypath)
    } else if (url.indexOf("action=delete") != -1) {
        console.log("[server]delete file " + filepath)
        fs.unlinkSync(filepath)
    }
    if (url.indexOf("action=createdir") != -1) {
        fs.mkdirSync(filepath)
        console.log("[server]new directory " + filepath)
    }
    if (typeof mypath == "undefined") {
        if (typeof req.body.path == "undefined") {
            console.log("[server]path is not defined")
            mypath = "/"
        } else {
            mypath = (req.body.path == "/" ? "" : req.body.path) + "/"
        }
    }
    console.log("[server]path is " + mypath)
    if (!req.files || Object.keys(req.files).length === 0) {
        return res.send(filesList(mypath, "Flash"))
    }
    let myFile = req.files.myfiles
    if (typeof myFile.length == "undefined") {
        let fullpath = path.normalize(
            serverpath + "Flash" + mypath + myFile.name
        )
        console.log("[server]one file:" + fullpath)
        myFile.mv(fullpath, function (err) {
            if (err) return res.status(500).send(err)
            res.send(filesList(mypath, "Flash"))
        })
        return
    } else {
        console.log(myFile.length + " files")
        for (let i = 0; i < myFile.length; i++) {
            let fullpath = path.normalize(
                serverpath + "Flash" + mypath + myFile[i].name
            )
            console.log(fullpath)
            myFile[i].mv(fullpath).then(() => {
                if (i == myFile.length - 1) res.send(filesList(mypath, "Flash"))
            })
        }
    }
})

app.all("/upload", function (req, res) {
    let mypath = req.query.path
    let url = req.originalUrl
    let filepath = path.normalize(
        serverpath + "SD" + mypath + "/" + req.query.filename
    )
    if (url.indexOf("action=deletedir") != -1) {
        console.log("[server]delete directory " + filepath)
        deleteFolderRecursive(filepath)
        fs.readdirSync(mypath)
    } else if (url.indexOf("action=delete") != -1) {
        fs.unlinkSync(filepath)
        console.log("[server]delete file " + filepath)
    }
    if (url.indexOf("action=createdir") != -1) {
        fs.mkdirSync(filepath)
        console.log("[server]new directory " + filepath)
    }
    if (typeof mypath == "undefined") {
        if (typeof req.body.path == "undefined") {
            console.log("[server]path is not defined")
            mypath = "/"
        } else {
            mypath = (req.body.path == "/" ? "" : req.body.path) + "/"
        }
    }
    console.log("[server]path is " + mypath)
    if (!req.files || Object.keys(req.files).length === 0) {
        return res.send(filesList(mypath, "SD"))
    }
    let myFile = req.files.myfiles
    if (typeof myFile.length == "undefined") {
        let fullpath = path.normalize(serverpath + "SD" + mypath + myFile.name)
        console.log("[server]one file:" + fullpath)
        myFile.mv(fullpath, function (err) {
            if (err) return res.status(500).send(err)
            res.send(filesList(mypath, "SD"))
        })
        return
    } else {
        console.log(myFile.length + " files")
        for (let i = 0; i < myFile.length; i++) {
            let fullpath = path.normalize(
                serverpath + "SD" + mypath + myFile[i].name
            )
            console.log(fullpath)
            myFile[i].mv(fullpath).then(() => {
                if (i == myFile.length - 1) res.send(filesList(mypath, "SD"))
            })
        }
    }
})

wss.on("connection", (socket, request) => {
    console.log(wscolor("[ws] New connection"))
    console.log(wscolor(`[ws] currentID:${currentID}`))
    socket.send(`currentID:${currentID}`)
    wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(`activeID:${currentID}`)
        }
    })
    if (sensorInterval != -1) {
        clearInterval(sensorInterval)
        sensorInterval = setInterval(() => {
            const sensorTxt = "SENSOR:10[C] 15[%]"
            SendWS(sensorTxt, false, false)
        }, 3000)
    }
    currentID++
    socket.on("message", (message) => {
        const msgStr = message.toString()
        console.log(wscolor("[ws] received:", msgStr))
        HandleWSMessage(msgStr, socket)
    })
})
wss.on("error", (error) => {
    console.log(wscolor("[ws] Error:", error))
})

function HandleWSMessage(message, socket) {
    if (message.startsWith("$Settings/List")) {
        HandleGetSettings(message, socket)
    }
}

function HandleGetSettings(message, socket) {
    SendWS("$Grbl/SoftLimitsEnable=0\n", true, false)
    SendWS("$Grbl/HardLimitsEnable=0\n", true, false)
    SendWS("$Grbl/HomingCycleEnable=0\n", true, false)
    SendWS("$Grbl/HomingDirections=0\n", true, false)
    SendWS("$Grbl/MaxSpindleSpeed=0\n", true, false)
    SendWS("$Grbl/LaserMode=0\n", true, false)
    SendWS("$Grbl/Resolution/X=80.000\n", true, false)
    SendWS("$Grbl/Resolution/Y=80.000\n", true, false)
    SendWS("$Grbl/Resolution/Z=80.000\n", true, false)
    SendWS("$Grbl/MaxRate/X=1000.000\n", true, false)
    SendWS("$Grbl/MaxRate/Y=1000.000\n", true, false)
    SendWS("$Grbl/MaxRate/Z=1000.000\n", true, false)
    SendWS("$Grbl/Acceleration/X=25.000\n", true, false)
    SendWS("$Grbl/Acceleration/Y=25.000\n", true, false)
    SendWS("$Grbl/Acceleration/Z=25.000\n", true, false)
    SendWS("$Grbl/MaxTravel/X=1000.000\n", true, false)
    SendWS("$Grbl/MaxTravel/Y=1000.000\n", true, false)
    SendWS("$Grbl/MaxTravel/Z=1000.000\n", true, false)
    SendWS("$Notification/Type=NONE\n", true, false)
    SendWS("$Notification/T1=\n", true, false)
    SendWS("$Notification/T2=\n", true, false)
    SendWS("$Notification/TS=\n", true, false)
    SendWS("$Telnet/Enable=ON\n", true, false)
    SendWS("$Telnet/Port=23\n", true, false)
    SendWS("$HTTP/BlockDuringMotion=ON\n", true, false)
    SendWS("$HTTP/Enable=ON\n", true, false)
    SendWS("$HTTP/Port=80\n", true, false)
    SendWS("$MDNS/Enable=ON\n", true, false)
    SendWS("$WiFi/PsMode=None\n", true, false)
    SendWS("$WiFi/Mode=STA>AP\n", true, false)
    SendWS("$Sta/Password=********\n", true, false)
    SendWS("$Sta/MinSecurity=WPA2-PSK\n", true, false)
    SendWS("$WiFi/FastScan=OFF\n", true, false)
    SendWS("$Sta/IPMode=DHCP\n", true, false)
    SendWS("$Sta/IP=0.0.0.0\n", true, false)
    SendWS("$Sta/Gateway=0.0.0.0\n", true, false)
    SendWS("$Sta/Netmask=0.0.0.0\n", true, false)
    SendWS("$AP/Country=01\n", true, false)
    SendWS("$AP/SSID=FluidNCfghj\n", true, false)
    SendWS("$AP/Password=********\n", true, false)
    SendWS("$AP/IP=192.168.0.1\n", true, false)
    SendWS("$AP/Channel=1\n", true, false)
    SendWS("$Hostname=fluidnc\n", true, false)
    SendWS("$Sta/SSID=BlackWidow\n", true, false)
    SendWS("$GCode/Echo=OFF\n", true, false)
    SendWS("$Start/Message=Grbl \\V [FluidNC \\B (\\R) \\H]\n", true, false)
    SendWS("$Firmware/Build=\n", true, false)
    SendWS("$SD/FallbackCS=-1\n", true, false)
    SendWS("$Report/Status=1\n", true, false)
    SendWS("$Config/Filename=config.yaml\n", true, false)
    SendWS("$Message/Level=Info\n", true, false)
    SendWS("ok\n", true, false)
}
