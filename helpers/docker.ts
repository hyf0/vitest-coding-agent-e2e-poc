import Docker from 'dockerode'

const docker = new Docker()

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface EvalContainer {
  exec(command: string): Promise<ExecResult>
  copyFileIn(hostPath: string, containerPath: string): Promise<void>
  cleanup(): Promise<void>
}

export async function createEvalContainer(options: {
  image: string
  env?: Record<string, string>
  workdir?: string
}): Promise<EvalContainer> {
  const workdir = options.workdir ?? '/app'
  const envArray = options.env
    ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`)
    : []

  const container = await docker.createContainer({
    Image: options.image,
    Cmd: ['sleep', 'infinity'],
    WorkingDir: workdir,
    Env: envArray,
    Tty: false,
  })

  await container.start()

  // Ensure workdir exists
  await execInContainer(container, `mkdir -p ${workdir}`, workdir)

  return {
    async exec(command: string): Promise<ExecResult> {
      return execInContainer(container, command, workdir)
    },

    async copyFileIn(hostPath: string, containerPath: string): Promise<void> {
      const fs = await import('fs')
      const path = await import('path')
      const tar = await createTarBuffer(
        path.basename(containerPath),
        fs.readFileSync(hostPath),
      )
      await container.putArchive(tar, { path: path.dirname(containerPath) })
    },

    async cleanup(): Promise<void> {
      try {
        await container.stop({ t: 0 })
      } catch {
        // container may already be stopped
      }
      await container.remove({ force: true })
    },
  }
}

async function execInContainer(
  container: Docker.Container,
  command: string,
  workdir: string,
): Promise<ExecResult> {
  const exec = await container.exec({
    Cmd: ['sh', '-c', command],
    WorkingDir: workdir,
    AttachStdout: true,
    AttachStderr: true,
  })

  const stream = await exec.start({ hijack: true, stdin: false })

  const { stdout, stderr } = await collectOutput(stream)

  const inspect = await exec.inspect()
  const exitCode = inspect.ExitCode ?? 1

  return { stdout, stderr, exitCode }
}

function collectOutput(
  stream: NodeJS.ReadableStream,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''

    // Docker multiplexes stdout/stderr in a single stream.
    // Each frame: 8-byte header [type(1), 0, 0, 0, size(4)] + payload
    const chunks: Buffer[] = []

    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })

    stream.on('end', () => {
      const buf = Buffer.concat(chunks)
      let offset = 0

      while (offset < buf.length) {
        if (offset + 8 > buf.length) break
        const type = buf.readUInt8(offset)
        const size = buf.readUInt32BE(offset + 4)
        if (offset + 8 + size > buf.length) break
        const payload = buf.subarray(offset + 8, offset + 8 + size).toString()

        if (type === 1) {
          stdout += payload
        } else if (type === 2) {
          stderr += payload
        }

        offset += 8 + size
      }

      resolve({ stdout, stderr })
    })

    stream.on('error', reject)
  })
}

async function createTarBuffer(
  filename: string,
  content: Buffer,
): Promise<Buffer> {
  // Minimal tar archive: 512-byte header + content padded to 512 bytes + 1024 zero bytes
  const header = Buffer.alloc(512)
  const nameBytes = Buffer.from(filename, 'utf-8')
  nameBytes.copy(header, 0, 0, Math.min(nameBytes.length, 100))

  // File mode: 0644
  Buffer.from('0000644\0', 'utf-8').copy(header, 100)
  // Owner/group uid/gid: 0
  Buffer.from('0000000\0', 'utf-8').copy(header, 108)
  Buffer.from('0000000\0', 'utf-8').copy(header, 116)
  // File size in octal
  Buffer.from(content.length.toString(8).padStart(11, '0') + '\0', 'utf-8').copy(header, 124)
  // Modification time
  Buffer.from(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 'utf-8').copy(header, 136)
  // Type flag: normal file
  header.writeUInt8(0x30, 156)

  // Compute checksum
  // First fill checksum field with spaces
  Buffer.from('        ', 'utf-8').copy(header, 148)
  let checksum = 0
  for (let i = 0; i < 512; i++) {
    checksum += header[i]
  }
  Buffer.from(checksum.toString(8).padStart(6, '0') + '\0 ', 'utf-8').copy(header, 148)

  const padding = Buffer.alloc(512 - (content.length % 512 || 512))
  const eof = Buffer.alloc(1024)

  return Buffer.concat([header, content, padding, eof])
}
