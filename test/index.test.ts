import path from 'path'
import fs from 'fs'
import { majo, glob, remove, ensureDir } from '../src'

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

test('reserved filenames survive multiple source glob reads', async () => {
  const firstDir = path.join(__dirname, 'fixture/doubleSource')
  const secondDir = path.join(__dirname, 'fixture/stats')
  const stream = majo()
    .source('**', { baseDir: firstDir })
    .source('**/*.md', { baseDir: secondDir })

  await stream.process()

  expect(Object.getPrototypeOf(stream.files)).toBeNull()
  expect(Object.prototype.hasOwnProperty.call(stream.files, '__proto__')).toBe(true)
  expect(stream.fileList).toContain('__proto__')
  expect(stream.fileContents('__proto__')).toBe('reserved filename\n')
  expect(stream.sourceBaseDirs['__proto__']).toBe(firstDir)
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


test('repeated process reloads disk sources but preserves manually created records', async () => {
  const sourceDir = path.join(__dirname, 'output/source-reload')
  await remove(sourceDir)
  await ensureDir(sourceDir)
  const original = path.join(sourceDir, 'previous.txt')
  const replacement = path.join(sourceDir, 'replacement.txt')
  try {
    fs.writeFileSync(original, 'previous disk contents')
    const stream = majo().source('*.txt', { baseDir: sourceDir })
    await stream.process()
    expect(stream.fileContents('previous.txt')).toBe('previous disk contents')
    // Explicit additions are not implicit snapshots from glob().
    stream.createFile('manual.generated', {
      path: path.join(sourceDir, 'manual.generated'),
      contents: Buffer.from('keep manual contents'),
      stats: fs.statSync(original)
    })
    fs.unlinkSync(original)
    fs.writeFileSync(replacement, 'replacement disk contents')
    await stream.process()
    expect(stream.fileList).toEqual(['manual.generated', 'replacement.txt'])
    expect(stream.fileContents('replacement.txt')).toBe('replacement disk contents')
    expect(stream.fileContents('manual.generated')).toBe('keep manual contents')
    expect(stream.sourceBaseDirs['previous.txt']).toBeUndefined()
    expect(stream.sourceBaseDirs['replacement.txt']).toBe(sourceDir)
  } finally {
    await remove(sourceDir)
  }
})

test('renaming a source to itself never deletes its contents or origin', async () => {
  const sourceDir = path.join(__dirname, 'fixture/stats')
  const stream = majo().source('**/*.md', { baseDir: sourceDir })
  await stream.process()
  const previous = stream.fileContents('foo.md')
  const origin = stream.sourceBaseDirs['foo.md']
  stream.rename('foo.md', 'foo.md')
  expect(stream.fileList).toEqual(['foo.md'])
  expect(stream.fileContents('foo.md')).toBe(previous)
  expect(stream.sourceBaseDirs['foo.md']).toBe(origin)
})
