const {digs} = require("@kaspernj/object-digger")
const fs = require("fs").promises
const fsOriginal = require("fs")
const path = require("path")
const yauzl = require("yauzl")

class UnpackAndFixZip {
  async unpackAndFixZip() {
    const filesPath = "/Users/kaspernj/Dropbox/Apps/Google Download Your Data"
    const files = await fs.readdir(filesPath)

    for (const file of files) {
      const filePath = `${filesPath}/${file}`
      const extName = path.extname(file)

      if (extName == ".zip") {
        console.log({ file })

        await this.readZipFile(filePath)
      } else {
        console.error(`Unknown extension: ${extName} for: ${file}`)
      }
    }
  }

  readZipFile(filePath) {
    return new Promise((resolve, reject) => {
      yauzl.open(filePath, {lazyEntries: true}, (zipFileError, zipFile) => {
        if (zipFileError) {
          reject(zipFileError)
          throw new Error(zipFileError)
        }

        zipFile.on("end", () => {
          console.log(`End of entries for ${filePath}`)
          resolve()
        })

        zipFile.on("entry", async (entry) => {
          const {fileName} = digs(entry, "fileName")

          if (!fileName.match(/\/$/)) {
            // This is a file and not a folder
            await this.readEntry(entry, zipFile)
          }

          zipFile.readEntry()
        })

        // Start by reading the first entry
        zipFile.readEntry()
      })
    })
  }

  async readEntry(entry, zipFile) {
    const {fileName, uncompressedSize} = digs(entry, "fileName", "uncompressedSize")

    if (this.shouldWriteFile(fileName, uncompressedSize)) {
      await this.writeEntryToFile(zipFile, entry, fileName)
    }

    this.updateLastModified(entry)
  }

  updateLastModified(entry) {
    const {fileName, lastModFileDate, lastModFileTime} = digs(entry, "fileName", "lastModFileDate", "lastModFileTime")
    const lastModifiedDate = yauzl.dosDateTimeToDate(lastModFileDate, lastModFileTime)
    const fileStat = fsOriginal.statSync(fileName)
    const {atime: currentAccessDate, mtime: currentModifiedDate} = digs(fileStat, "atime", "mtime")

    if (`${lastModifiedDate}` != `${currentModifiedDate}`) {
      console.log(`Changing modified for ${fileName} from`, currentModifiedDate, "to", lastModifiedDate)
      fsOriginal.utimesSync(fileName, currentAccessDate, lastModifiedDate)
    }
  }

  shouldWriteFile(fileName, uncompressedSize) {
    if (!fsOriginal.existsSync(fileName)) {
      console.log(`Write ${fileName} because it doesn't exist`)
      return true
    }

    const fileStat = fsOriginal.statSync(fileName)
    const {size} = digs(fileStat, "size")

    if (size == uncompressedSize) {
      // console.log(`Skip ${fileName} because it exists with the same size`, {size, uncompressedSize})

      return false
    } else {
      console.log(`Overwrite ${fileName} because it has a different size`, {size, uncompressedSize})

      return true
    }
  }

  writeEntryToFile(zipFile, entry, fileName) {
    console.log("writeEntryToFile", fileName)

    return new Promise((resolve, reject) => {
      zipFile.openReadStream(entry, function(readStreamError, readStream) {
        if (readStreamError) {
          return reject(readStreamError)
        }

        const entryDirName = path.dirname(fileName)

        if (!fsOriginal.existsSync(entryDirName)) {
          fsOriginal.mkdirSync(entryDirName, {recursive: true})
        }

        const writeStream = fsOriginal.createWriteStream(fileName)

        writeStream.on("error", (writeStreamError) => {
          reject(writeStreamError)
        })

        readStream.on("end", () => {
          writeStream.end(() => {
            resolve()
          })
        })

        readStream.pipe(writeStream)
      })
    })
  }
}

const instance = new UnpackAndFixZip()

instance.unpackAndFixZip()
