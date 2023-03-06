import yauzl from 'yauzl'
import fs from 'fs'
import path from 'path'
import request from 'request'

const SINGLE = 1024 * 1024

const log = {
  error(msg) {
    console.error(msg)
  },
  info(msg) {
    console.log(msg);
  }
}

export class FileService {
  mkdirs(dirPath: string) {
    if (!fs.existsSync(path.dirname(dirPath))) {
      this.mkdirs(path.dirname(dirPath));
    }
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath);
    }
  }

  async unzip(zipFilePath: string, unzipPath: string) {
    return new Promise((accept, reject) => {
      yauzl.open(zipFilePath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          reject(err)
        }

        let counter = 0
        zipfile.readEntry()
        zipfile.on('entry', (entry) => {
          counter++
          if (/\/$/.test(entry.fileName)) {
            zipfile.readEntry()
          } else {
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) {
                reject(err)
              }
              let unzipPath_deep = path.normalize(unzipPath + '/' + entry.fileName)
              this.mkdirs(
                path.normalize(unzipPath_deep.substring(0, unzipPath_deep.lastIndexOf(path.normalize('/'))) + '/')
              )
              readStream.on('end', () => {
                zipfile.readEntry()
              })
              let writeStream = fs.createWriteStream(unzipPath_deep)
              readStream.pipe(writeStream)
              writeStream.on('error', (error) => {
                reject(error)
              })
              readStream.on('error', (error) => {
                reject(error)
              })
            })
          }
        })
        zipfile.on('end', function (entry) {
          if (counter === zipfile.entryCount) {
            accept('end')
          }
        })
        zipfile.on('error', function (err) {
          reject(err)
        })
      })
    })
  }

  private async downLoadGreenPkgZip(params: {
    pkgPath: string
    ossFileUrl: string
    totalPkgSize: number
    receivedSize?: number
    end?: number
  }): Promise<boolean> {
    let { pkgPath, ossFileUrl, totalPkgSize, receivedSize = 0, end = SINGLE } = params
    return new Promise((res) => {
      const param = {
        method: 'GET',
        url: ossFileUrl,
        headers: {
          Range: end === totalPkgSize ? `bytes=${receivedSize}-` : `bytes=${receivedSize}-${end}`
        }
      }
      const out = fs.createWriteStream(pkgPath, {
        start: receivedSize,
        flags: receivedSize > 0 ? 'a+' : 'w'
      })
      out.on('close', async () => {
        if (end >= totalPkgSize) {
          res(true)
          return
        }
        receivedSize = end + 1
        end += SINGLE
        if (end >= totalPkgSize) end = totalPkgSize
        const data = await this.downLoadGreenPkgZip({
          pkgPath,
          ossFileUrl,
          totalPkgSize,
          receivedSize,
          end
        })
        res(data)
      })
      request(param, (err) => {
        if (err) {
          log.error('OSS file download error: ', err)
          res(false)
        }
      })
        .on('error', (err) => {
          log.error('OSS file download error: ', err)
          res(false)
        })
        .on('end', async () => {
          log.info('file download complete')
        })
        .pipe(out)
    })
  }
}