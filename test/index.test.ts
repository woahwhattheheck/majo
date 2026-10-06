import path from 'path'
import { majo, glob, remove } from '../src'

test('main', async () => {
  const outputDir = path.join(__dirname, 'output/main')
  await remove(outputDir)
  const stream = await majo()
    .source('**', { baseDir: path.join(__dirname, 'fixture/source') })
    .dest('./output/main', { baseDir: __dirname })
  expect(
    await glob('**/*', { cwd: outputDir }).then(result => result.sort())
  ).toEqual(stream.fileList)
})

test('middleware', async () => {
  const stream = majo()
    .source('**', { baseDir: path.join(__dirname, 'fixture/source') })
    .use(({ files }) => {
      const contents = files['tmp.js'].contents.toString()
      files['tmp.js'].contents = Buffer.from(contents.replace(`'a'`, `'aaa'`))
    })

  await stream.process()

  expect(stream.fileContents('tmp.js')).toMatch(`const a = () => 'aaa'`)
})

test('filter', async () => {
  const stream = majo()

  stream
    .source('**', { baseDir: path.join(__dirname, 'fixture/source') })
    .filter(filepath => {
      return filepath !== 'should-filter.js'
    })

  await stream.process()

  expect(stream.fileList).toContain('tmp.js')
  expect(stream.fileList).not.toContain('should-filter.js')
})

test('stats', async () => {
  const stream = majo()

  stream.source('**/*.md', { baseDir: path.join(__dirname, 'fixture/stats') })

  await stream.process()

  expect(typeof stream.files['foo.md'].stats).toBe('object')
})

test('rename', async () => {
  const stream = majo()

  stream.source('**/*', { baseDir: path.join(__dirname, 'fixture/rename') })

  stream.use(ctx => {
    ctx.rename('a.txt', 'b/c.txt')
  })

  await stream.process()

  expect(stream.fileList).toEqual(['b/c.txt'])
})


test('multiple sources preserve order and source base on rename', async () => {
  const firstDir = path.join(__dirname, 'fixture/doubleSource')
  const secondDir = path.join(__dirname, 'fixture/stats')
  const stream = majo()

  stream
    .source('**/*.md', { baseDir: firstDir })
    .source('**/*.md', { baseDir: secondDir })
    .use(ctx => {
      ctx.rename('bar.md', 'renamed/bar.md')
    })

  await stream.process()

  expect(stream.files['renamed/bar.md']).toBeDefined()
  expect(stream.file('renamed/bar.md').path).toBe(
    path.join(firstDir, 'renamed/bar.md')
  )
  expect(stream.files['foo.md']).toBeDefined()
  expect(stream.fileContents('foo.md')).toBe('')
})

test('later sources keep an earlier onWrite hook when omitted', async () => {
  const outputDir = path.join(__dirname, 'output/multipleSourceOnWrite')
  const written: string[] = []

  await remove(outputDir)

  await majo()
    .source('**/*.md', {
      baseDir: path.join(__dirname, 'fixture/doubleSource'),
      onWrite(relativePath) {
        written.push(relativePath)
      }
    })
    .source('**/*.md', { baseDir: path.join(__dirname, 'fixture/stats') })
    .dest('./output/multipleSourceOnWrite', { baseDir: __dirname })

  expect(written.sort()).toEqual(['bar.md', 'foo.md'])
})
