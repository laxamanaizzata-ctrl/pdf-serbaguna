import './style.css'
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { Ream } from 'reamkit'
import { createPdfToolkit } from 'pdfstudio'


pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

// Safari compatibility:
// PDF.js 6.x getTextContent() internally uses async iteration over ReadableStream.
// Stable Safari 26.5 can fail with "undefined is not a function" because
// ReadableStream[Symbol.asyncIterator] is not available there.
// Consume streamTextContent() through getReader() instead.
async function getTextContentCompat(page) {
  if (!page || typeof page.streamTextContent !== 'function') {
    return await page.getTextContent()
  }

  const stream = page.streamTextContent()
  if (!stream || typeof stream.getReader !== 'function') {
    return await page.getTextContent()
  }

  const reader = stream.getReader()
  const textContent = {
    items: [],
    styles: Object.create(null),
    lang: null
  }

  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break

      const value = result.value
      if (!value) continue

      if (textContent.lang == null && value.lang != null) {
        textContent.lang = value.lang
      }

      if (value.styles) {
        Object.assign(textContent.styles, value.styles)
      }

      if (value.items && value.items.length) {
        for (let i = 0; i < value.items.length; i++) {
          textContent.items.push(value.items[i])
        }
      }
    }
  } finally {
    try {
      reader.releaseLock()
    } catch (_) {
      // No-op: older Safari may not require/reliably expose releaseLock.
    }
  }

  return textContent
}

const tools = [
  { id:'word-pdf', title:'Word ke PDF', icon:'W', cat:'convert', desc:'Ubah DOC/DOCX menjadi PDF.', accept:'.doc,.docx' },
  { id:'excel-pdf', title:'Excel ke PDF', icon:'X', cat:'convert', desc:'Ubah XLS/XLSX menjadi PDF.', accept:'.xls,.xlsx' },
  { id:'ppt-pdf', title:'PowerPoint ke PDF', icon:'P', cat:'convert', desc:'Ubah PPT/PPTX menjadi PDF.', accept:'.ppt,.pptx' },
  { id:'image-pdf', title:'JPG/PNG ke PDF', icon:'IMG', cat:'convert', desc:'Gabungkan gambar menjadi satu PDF.', accept:'image/jpeg,image/png', multiple:true },
  { id:'pdf-word', title:'PDF ke Word', icon:'DOC', cat:'convert', desc:'Rekonstruksi PDF menjadi DOCX yang dapat diedit.', accept:'.pdf,application/pdf' },
  { id:'pdf-jpg', title:'PDF ke JPG', icon:'JPG', cat:'convert', desc:'Render halaman PDF menjadi JPG.', accept:'.pdf,application/pdf' },
  { id:'pdf-excel', title:'PDF ke Excel', icon:'XLS', cat:'convert', desc:'Ekstrak teks/tabel PDF ke workbook XLSX.', accept:'.pdf,application/pdf' },

  { id:'merge', title:'Gabung PDF', icon:'＋', cat:'organize', desc:'Gabungkan PDF; ubah urutan file dengan drag-and-drop.', accept:'.pdf,application/pdf', multiple:true },
  { id:'split', title:'Pisah PDF', icon:'✂', cat:'organize', desc:'Pisah per halaman, rentang, atau sejumlah halaman per file.', accept:'.pdf,application/pdf' },
  { id:'reorder', title:'Atur Halaman PDF', icon:'↕', cat:'organize', desc:'Susun ulang atau buang halaman dengan thumbnail visual.', accept:'.pdf,application/pdf' },
  { id:'compress', title:'Kompres PDF', icon:'ZIP', cat:'organize', desc:'Kompresi lossless dan optimasi struktur PDF.', accept:'.pdf,application/pdf' },

  { id:'edit', title:'Edit & Ganti Teks PDF', icon:'✎', cat:'edit', desc:'Ganti teks yang ada, tambah teks, rotasi, atau hapus halaman.', accept:'.pdf,application/pdf' },
  { id:'watermark', title:'Watermark PDF', icon:'WM', cat:'edit', desc:'Tambahkan watermark teks transparan pada semua halaman.', accept:'.pdf,application/pdf' },
  { id:'page-numbers', title:'Nomor Halaman', icon:'#', cat:'edit', desc:'Tambahkan nomor halaman di posisi pilihan.', accept:'.pdf,application/pdf' },
  { id:'sign', title:'Tanda Tangan PDF', icon:'✍', cat:'edit', desc:'Tempel tanda tangan PNG/JPG ke halaman tertentu.', accept:'.pdf,application/pdf' },

  { id:'lock', title:'Beri Password PDF', icon:'🔒', cat:'security', desc:'Lindungi PDF dengan enkripsi AES-256 dan password.', accept:'.pdf,application/pdf' },
  { id:'unlock', title:'Buka/Hapus Password', icon:'🔓', cat:'security', desc:'Hapus proteksi PDF menggunakan password yang benar.', accept:'.pdf,application/pdf' },
]

const grid = document.querySelector('#toolsGrid')
const modal = document.querySelector('#modal')
const modalTitle = document.querySelector('#modalTitle')
const modalDescription = document.querySelector('#modalDescription')
const modalIcon = document.querySelector('#modalIcon')
const modalBody = document.querySelector('#modalBody')
const statusBox = document.querySelector('#status')
const searchTool = document.querySelector('#searchTool')
const categoryFilter = document.querySelector('#categoryFilter')

let toolkitPromise = null
const getToolkit = () => toolkitPromise ??= createPdfToolkit()

let activeTool = null
let activeFiles = []
let reorderedPages = []
let thumbnailGeneration = 0

function renderTools() {
  const q = searchTool.value.trim().toLowerCase()
  const cat = categoryFilter.value
  const visible = tools.filter(t =>
    (cat === 'all' || t.cat === cat) &&
    (`${t.title} ${t.desc}`.toLowerCase().includes(q))
  )

  grid.innerHTML = visible.map(t => `
    <button class="tool-card" data-tool="${t.id}">
      <span class="tool-icon cat-${t.cat}">${t.icon}</span>
      <span class="tool-copy">
        <strong>${t.title}</strong>
        <small>${t.desc}</small>
      </span>
      <span class="arrow">→</span>
    </button>
  `).join('')

  grid.querySelectorAll('[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => openTool(btn.dataset.tool))
  })
}

function filePicker(tool) {
  return `
    <label class="drop-zone" id="dropZone">
      <input id="fileInput" type="file" accept="${tool.accept}" ${tool.multiple ? 'multiple' : ''} />
      <span class="upload-symbol">↑</span>
      <strong>Pilih file</strong>
      <small>atau seret file ke area ini</small>
    </label>
    <div id="fileList" class="file-list"></div>
    <div id="previewWrap" class="preview-wrap" hidden>
      <div class="section-label">Preview</div>
      <div id="pdfPreview" class="pdf-preview"></div>
    </div>
  `
}

function toolExtra(id) {
  if (id === 'split') return `
    <div class="form-grid">
      <label>Mode split
        <select id="splitMode">
          <option value="each">Setiap halaman menjadi file</option>
          <option value="ranges">Kelompok rentang halaman</option>
          <option value="chunks">Sejumlah halaman per file</option>
        </select>
      </label>
      <label id="rangeLabel" hidden>Kelompok rentang
        <input id="splitRanges" type="text" placeholder="1-3; 4-6; 8,10" />
      </label>
      <label id="chunkLabel" hidden>Halaman per file
        <input id="pagesPerFile" type="number" min="1" value="5" />
      </label>
    </div>
    <p class="small-note">Untuk mode rentang, pisahkan setiap file hasil dengan tanda titik koma. Contoh: <strong>1-3; 4-6; 8,10</strong>.</p>`

  if (id === 'lock') return `
    <div class="form-grid">
      <label>Password pembuka<input id="userPassword" type="password" autocomplete="new-password" placeholder="Masukkan password" /></label>
      <label>Password pemilik (opsional)<input id="ownerPassword" type="password" autocomplete="new-password" placeholder="Boleh sama dengan password pembuka" /></label>
    </div>`

  if (id === 'unlock') return `
    <label class="field">Password PDF<input id="pdfPassword" type="password" autocomplete="current-password" placeholder="Masukkan password yang benar" /></label>
    <p class="small-note">Fitur ini tidak menebak atau membobol password. Password yang sah wajib diketahui.</p>`

  if (id === 'edit') return `
    <div class="form-grid">
      <label>Aksi
        <select id="editAction">
          <option value="replace-text">Ganti teks yang ada</option>
          <option value="add-text">Tambah teks</option>
          <option value="rotate">Rotasi halaman</option>
          <option value="delete">Hapus halaman</option>
        </select>
      </label>
      <label>Nomor halaman<input id="pageNumber" type="number" min="1" value="1" /></label>
    </div>

    <div id="replaceTextFields">
      <div class="form-grid">
        <label class="span-2">Cari teks lama
          <input id="findText" type="text" placeholder="Contoh: Nama Lama" />
        </label>
        <label class="span-2">Ganti menjadi
          <input id="replaceText" type="text" placeholder="Contoh: Nama Baru" />
        </label>
        <label>Cakupan
          <select id="replaceScope">
            <option value="page">Hanya halaman yang dipilih</option>
            <option value="all">Semua halaman</option>
          </select>
        </label>
        <label>Kecocokan
          <select id="replaceCase">
            <option value="insensitive">Abaikan huruf besar/kecil</option>
            <option value="sensitive">Harus sama persis</option>
          </select>
        </label>
      </div>
      <p class="small-note">
        Fitur ini mencari teks digital pada PDF, menutup teks lama, lalu menulis teks baru pada posisi yang sama.
        PDF hasil scan/foto belum dapat diubah tanpa OCR.
      </p>
    </div>

    <div id="addTextFields" class="form-grid" hidden>
      <label class="span-2">Teks<input id="editText" type="text" placeholder="Teks yang akan ditambahkan" /></label>
      <label>Jarak dari kiri (pt)<input id="posX" type="number" value="50" /></label>
      <label>Jarak dari atas (pt)<input id="posY" type="number" value="50" /></label>
      <label>Ukuran font<input id="fontSize" type="number" min="6" max="96" value="18" /></label>
    </div>
    <div id="rotateFields" class="form-grid" hidden>
      <label>Derajat
        <select id="rotation">
          <option value="90">90°</option>
          <option value="180">180°</option>
          <option value="270">270°</option>
        </select>
      </label>
    </div>`

  if (id === 'watermark') return `
    <div class="form-grid">
      <label class="span-2">Teks watermark<input id="watermarkText" type="text" value="DOKUMEN" /></label>
      <label>Ukuran font<input id="watermarkSize" type="number" min="8" max="120" value="48" /></label>
      <label>Transparansi
        <select id="watermarkOpacity">
          <option value="0.12">12%</option>
          <option value="0.2" selected>20%</option>
          <option value="0.3">30%</option>
          <option value="0.4">40%</option>
        </select>
      </label>
      <label>Rotasi
        <select id="watermarkRotation">
          <option value="-45" selected>-45°</option>
          <option value="0">0°</option>
          <option value="45">45°</option>
        </select>
      </label>
      <label>Posisi
        <select id="watermarkPosition">
          <option value="center">Tengah</option>
          <option value="top">Atas</option>
          <option value="bottom">Bawah</option>
        </select>
      </label>
    </div>`

  if (id === 'page-numbers') return `
    <div class="form-grid">
      <label>Mulai dari nomor<input id="pageStart" type="number" value="1" /></label>
      <label>Ukuran font<input id="pageNumSize" type="number" min="6" max="36" value="10" /></label>
      <label>Posisi
        <select id="pageNumPosition">
          <option value="bottom-center">Bawah tengah</option>
          <option value="bottom-right">Bawah kanan</option>
          <option value="bottom-left">Bawah kiri</option>
          <option value="top-center">Atas tengah</option>
          <option value="top-right">Atas kanan</option>
          <option value="top-left">Atas kiri</option>
        </select>
      </label>
      <label>Format
        <select id="pageNumFormat">
          <option value="plain">1, 2, 3</option>
          <option value="page">Halaman 1</option>
          <option value="total">1 / 10</option>
        </select>
      </label>
    </div>`

  if (id === 'sign') return `
    <div class="signature-upload">
      <label class="field">Gambar tanda tangan (PNG/JPG)
        <input id="signatureInput" type="file" accept="image/png,image/jpeg" />
      </label>
    </div>
    <div class="form-grid">
      <label>Halaman<input id="signPage" type="number" min="1" value="1" /></label>
      <label>Lebar tanda tangan (pt)<input id="signWidth" type="number" min="30" value="140" /></label>
      <label>Jarak dari kiri (pt)<input id="signX" type="number" min="0" value="60" /></label>
      <label>Jarak dari atas (pt)<input id="signY" type="number" min="0" value="500" /></label>
    </div>
    <div id="signaturePreview" class="signature-preview" hidden></div>`

  if (id === 'reorder') return `
    <p class="small-note">Setelah PDF dipilih, seret thumbnail halaman untuk mengubah urutan. Klik × pada thumbnail untuk membuang halaman dari hasil.</p>`

  if (id === 'compress') return `
    <p class="small-note">Kompresi bersifat <strong>lossless</strong>: teks/gambar tidak diturunkan kualitasnya. PDF berbasis foto yang sudah terkompresi mungkin hanya mengecil sedikit.</p>`

  return ''
}

function openTool(id) {
  activeTool = tools.find(t => t.id === id)
  activeFiles = []
  reorderedPages = []
  thumbnailGeneration++

  modal.hidden = false
  document.body.classList.add('no-scroll')
  modalTitle.textContent = activeTool.title
  modalDescription.textContent = activeTool.desc
  modalIcon.textContent = activeTool.icon
  statusBox.hidden = true
  statusBox.className = 'status'

  modalBody.innerHTML = `
    ${filePicker(activeTool)}
    ${toolExtra(id)}
    <button id="processBtn" class="primary-btn">Proses sekarang</button>
  `

  setupFilePicker()
  setupToolControls(id)
}

function setupFilePicker() {
  const input = modalBody.querySelector('#fileInput')
  const drop = modalBody.querySelector('#dropZone')

  input.addEventListener('change', async () => {
    await acceptFiles([...input.files])
  })

  ;['dragenter','dragover'].forEach(evt => drop.addEventListener(evt, e => {
    e.preventDefault()
    drop.classList.add('is-dragging')
  }))
  ;['dragleave','drop'].forEach(evt => drop.addEventListener(evt, e => {
    e.preventDefault()
    drop.classList.remove('is-dragging')
  }))
  drop.addEventListener('drop', async e => {
    const dropped = [...e.dataTransfer.files]
    if (!activeTool.multiple && dropped.length > 1) dropped.splice(1)
    await acceptFiles(dropped)
  })
}

async function acceptFiles(files) {
  const accepted = files.filter(file => matchesAccept(file, activeTool.accept))
  if (!accepted.length) {
    setStatus('Jenis file tidak sesuai dengan alat yang dipilih.', 'error')
    return
  }
  activeFiles = activeTool.multiple ? accepted : accepted.slice(0,1)
  renderFileList()

  const shouldPreviewPdf = activeFiles[0] && isPdf(activeFiles[0]) &&
    !['unlock','lock'].includes(activeTool.id)

  if (shouldPreviewPdf) {
    const limit = activeTool.id === 'reorder' ? 120 : 16
    await renderPdfPreview(activeFiles[0], limit, activeTool.id === 'reorder')
  } else {
    hidePreview()
  }
}

function renderFileList() {
  const el = modalBody.querySelector('#fileList')
  if (!activeFiles.length) { el.innerHTML = ''; return }

  const sortable = activeTool.id === 'merge' || activeTool.id === 'image-pdf'
  el.innerHTML = activeFiles.map((f, i) => `
    <div class="file-row ${sortable ? 'sortable' : ''}" draggable="${sortable}" data-index="${i}">
      <span class="drag-handle">${sortable ? '⋮⋮' : '📄'}</span>
      <span class="file-name">${escapeHtml(f.name)}</span>
      <small>${formatBytes(f.size)}</small>
      ${activeFiles.length > 1 ? `<button class="mini-btn remove-file" data-index="${i}" type="button" title="Hapus">×</button>` : ''}
    </div>
  `).join('')

  el.querySelectorAll('.remove-file').forEach(btn => btn.addEventListener('click', () => {
    activeFiles.splice(Number(btn.dataset.index), 1)
    renderFileList()
  }))

  if (sortable) setupSortableFiles(el)
}

function setupSortableFiles(container) {
  let from = null
  container.querySelectorAll('.file-row').forEach(row => {
    row.addEventListener('dragstart', () => { from = Number(row.dataset.index); row.classList.add('dragging') })
    row.addEventListener('dragend', () => row.classList.remove('dragging'))
    row.addEventListener('dragover', e => e.preventDefault())
    row.addEventListener('drop', e => {
      e.preventDefault()
      const to = Number(row.dataset.index)
      if (from === null || from === to) return
      const [moved] = activeFiles.splice(from, 1)
      activeFiles.splice(to, 0, moved)
      renderFileList()
    })
  })
}

function setupToolControls(id) {
  if (id === 'split') {
    const mode = modalBody.querySelector('#splitMode')
    const update = () => {
      modalBody.querySelector('#rangeLabel').hidden = mode.value !== 'ranges'
      modalBody.querySelector('#chunkLabel').hidden = mode.value !== 'chunks'
    }
    mode.addEventListener('change', update)
    update()
  }

  if (id === 'edit') {
    const action = modalBody.querySelector('#editAction')
    const update = () => {
      modalBody.querySelector('#replaceTextFields').hidden = action.value !== 'replace-text'
      modalBody.querySelector('#addTextFields').hidden = action.value !== 'add-text'
      modalBody.querySelector('#rotateFields').hidden = action.value !== 'rotate'
    }
    action.addEventListener('change', update)
    update()
  }

  if (id === 'sign') {
    const sig = modalBody.querySelector('#signatureInput')
    sig.addEventListener('change', () => {
      const file = sig.files?.[0]
      const box = modalBody.querySelector('#signaturePreview')
      if (!file) { box.hidden = true; box.innerHTML = ''; return }
      const url = URL.createObjectURL(file)
      box.hidden = false
      box.innerHTML = `<img src="${url}" alt="Preview tanda tangan">`
    })
  }

  modalBody.querySelector('#processBtn').addEventListener('click', processCurrentTool)
}

async function renderPdfPreview(file, maxPages=16, reorderMode=false) {
  const generation = ++thumbnailGeneration
  const wrap = modalBody.querySelector('#previewWrap')
  const preview = modalBody.querySelector('#pdfPreview')
  if (!wrap || !preview) return
  wrap.hidden = false
  preview.innerHTML = '<div class="preview-loading">Membuat preview halaman…</div>'

  try {
    const data = new Uint8Array(await file.arrayBuffer())
    const doc = await pdfjsLib.getDocument({ data }).promise
    if (generation !== thumbnailGeneration) return

    if (reorderMode) reorderedPages = Array.from({length: doc.numPages}, (_, i) => i)

    const count = Math.min(doc.numPages, maxPages)
    preview.innerHTML = ''

    for (let n=1; n<=count; n++) {
      if (generation !== thumbnailGeneration) return
      const page = await doc.getPage(n)
      const viewport = page.getViewport({ scale: 0.34 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d', { alpha:false })
      await page.render({ canvasContext:ctx, viewport }).promise

      const card = document.createElement('div')
      card.className = 'page-thumb'
      card.dataset.pageIndex = String(n-1)
      card.draggable = reorderMode
      card.innerHTML = `
        <div class="thumb-canvas-wrap"></div>
        <div class="thumb-footer">
          <span>Hal. ${n}</span>
          ${reorderMode ? '<button class="thumb-remove" type="button" title="Buang dari hasil">×</button>' : ''}
        </div>
      `
      card.querySelector('.thumb-canvas-wrap').appendChild(canvas)
      if (!reorderMode) {
        card.addEventListener('click', () => fillPageNumber(n))
      }
      preview.appendChild(card)
    }

    if (doc.numPages > maxPages) {
      preview.insertAdjacentHTML('beforeend',
        `<div class="preview-more">Preview menampilkan ${maxPages} dari ${doc.numPages} halaman. Semua halaman tetap dapat diproses.</div>`)
    }

    if (reorderMode) setupPageReorder(preview)
  } catch (e) {
    preview.innerHTML = `<div class="preview-error">Preview tidak tersedia. PDF mungkin terenkripsi atau tidak kompatibel.</div>`
  }
}

function setupPageReorder(container) {
  let fromPage = null
  container.querySelectorAll('.page-thumb').forEach(card => {
    card.addEventListener('dragstart', () => {
      fromPage = Number(card.dataset.pageIndex)
      card.classList.add('dragging')
    })
    card.addEventListener('dragend', () => card.classList.remove('dragging'))
    card.addEventListener('dragover', e => e.preventDefault())
    card.addEventListener('drop', e => {
      e.preventDefault()
      const toPage = Number(card.dataset.pageIndex)
      const fromPos = reorderedPages.indexOf(fromPage)
      const toPos = reorderedPages.indexOf(toPage)
      if (fromPos < 0 || toPos < 0 || fromPos === toPos) return
      const [moved] = reorderedPages.splice(fromPos, 1)
      reorderedPages.splice(toPos, 0, moved)
      reorderThumbDom(container)
    })
  })

  container.querySelectorAll('.thumb-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const card = btn.closest('.page-thumb')
      const p = Number(card.dataset.pageIndex)
      reorderedPages = reorderedPages.filter(x => x !== p)
      card.remove()
    })
  })
}

function reorderThumbDom(container) {
  const more = container.querySelector('.preview-more')
  reorderedPages.forEach(p => {
    const card = container.querySelector(`.page-thumb[data-page-index="${p}"]`)
    if (card) container.insertBefore(card, more || null)
  })
}

function fillPageNumber(n) {
  const targets = ['#pageNumber','#signPage']
  for (const sel of targets) {
    const input = modalBody.querySelector(sel)
    if (input) input.value = n
  }
}

function hidePreview() {
  const wrap = modalBody.querySelector('#previewWrap')
  if (wrap) wrap.hidden = true
}

function closeModal() {
  modal.hidden = true
  document.body.classList.remove('no-scroll')
  modalBody.innerHTML = ''
  activeFiles = []
  reorderedPages = []
  thumbnailGeneration++
}

document.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', closeModal))
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal() })

function setStatus(text, type='working') {
  statusBox.hidden = false
  statusBox.className = `status ${type}`
  statusBox.innerHTML = text
}

async function processCurrentTool() {
  if (!activeFiles.length) return setStatus('Silakan pilih file terlebih dahulu.', 'error')
  const btn = modalBody.querySelector('#processBtn')
  btn.disabled = true
  btn.textContent = 'Memproses…'
  setStatus('Memproses file secara lokal di browser…')

  try {
    switch(activeTool.id) {
      case 'word-pdf':
      case 'excel-pdf':
      case 'ppt-pdf': await officeToPdf(activeFiles[0]); break
      case 'image-pdf': await imagesToPdf(activeFiles); break
      case 'pdf-word': await pdfToWord(activeFiles[0]); break
      case 'pdf-jpg': await pdfToJpg(activeFiles[0]); break
      case 'pdf-excel': await pdfToExcel(activeFiles[0]); break

      case 'merge': await mergePdfs(activeFiles); break
      case 'split': await splitPdf(activeFiles[0]); break
      case 'reorder': await reorderPdf(activeFiles[0]); break
      case 'compress': await compressPdf(activeFiles[0]); break

      case 'edit': await editPdf(activeFiles[0]); break
      case 'watermark': await watermarkPdf(activeFiles[0]); break
      case 'page-numbers': await addPageNumbers(activeFiles[0]); break
      case 'sign': await signPdf(activeFiles[0]); break

      case 'lock': await lockPdf(activeFiles[0]); break
      case 'unlock': await unlockPdf(activeFiles[0]); break
    }
    if (!statusBox.classList.contains('success')) setStatus('Selesai. File hasil telah dibuat.', 'success')
  } catch (err) {
    console.error(err)
    setStatus(humanizeError(err), 'error')
  } finally {
    btn.disabled = false
    btn.textContent = 'Proses sekarang'
  }
}

async function officeToPdf(file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const doc = Ream.parse(bytes)
  const out = await doc.convert('pdf')
  downloadBytes(out, replaceExt(file.name, '.pdf'), 'application/pdf')
}

async function pdfToWord(file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const doc = Ream.parse(bytes)
  const out = await doc.convert('docx')
  downloadBytes(out, replaceExt(file.name, '.docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
}

async function imagesToPdf(files) {
  const pdf = await PDFDocument.create()
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')
    const img = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
    const page = pdf.addPage([img.width, img.height])
    page.drawImage(img, { x:0, y:0, width:img.width, height:img.height })
  }
  downloadBytes(await pdf.save(), 'gambar-gabungan.pdf', 'application/pdf')
}

async function mergePdfs(files) {
  if (files.length < 2) throw new Error('Pilih minimal 2 file PDF untuk digabung.')
  const toolkit = await getToolkit()
  const out = await toolkit.merge(files)
  downloadBytes(out, 'pdf-gabungan.pdf', 'application/pdf')
}

async function splitPdf(file) {
  const toolkit = await getToolkit()
  const mode = modalBody.querySelector('#splitMode').value
  const zip = new JSZip()
  const base = stripExt(file.name)

  if (mode === 'each') {
    const parts = await toolkit.split(file)
    parts.forEach((bytes, i) => zip.file(`${base}-halaman-${i+1}.pdf`, bytes))
  } else if (mode === 'chunks') {
    const pagesPerFile = Number(modalBody.querySelector('#pagesPerFile').value || 1)
    if (pagesPerFile < 1) throw new Error('Jumlah halaman per file minimal 1.')
    const parts = await toolkit.split(file, { pagesPerFile })
    parts.forEach((bytes, i) => zip.file(`${base}-bagian-${i+1}.pdf`, bytes))
  } else {
    const raw = modalBody.querySelector('#splitRanges').value.trim()
    const groups = raw.split(';').map(x => x.trim()).filter(Boolean)
    if (!groups.length) throw new Error('Masukkan minimal satu kelompok rentang halaman.')
    for (let i=0; i<groups.length; i++) {
      setStatus(`Membuat bagian ${i+1} dari ${groups.length}…`)
      const bytes = await toolkit.extractPages(file, { pages: groups[i] })
      zip.file(`${base}-bagian-${i+1}.pdf`, bytes)
    }
  }

  downloadBlob(await zip.generateAsync({ type:'blob' }), `${base}-split.zip`)
}

async function reorderPdf(file) {
  if (!reorderedPages.length) throw new Error('Tidak ada halaman yang tersisa untuk disimpan.')
  const src = await PDFDocument.load(await file.arrayBuffer())
  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, reorderedPages)
  pages.forEach(p => out.addPage(p))
  downloadBytes(await out.save(), `${stripExt(file.name)}-halaman-diatur.pdf`, 'application/pdf')
}

async function compressPdf(file) {
  const toolkit = await getToolkit()
  const before = file.size
  const out = await toolkit.compress(file)
  const after = out.byteLength
  downloadBytes(out, `${stripExt(file.name)}-kompres.pdf`, 'application/pdf')
  const diff = before ? ((before-after)/before)*100 : 0
  setStatus(
    `Selesai. Ukuran awal <strong>${formatBytes(before)}</strong>, hasil <strong>${formatBytes(after)}</strong>` +
    (diff > 0 ? ` — berkurang sekitar <strong>${diff.toFixed(1)}%</strong>.` : ` — file ini sudah cukup terkompresi.`),
    'success'
  )
}

async function pdfToJpg(file) {
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjsLib.getDocument({ data }).promise
  const zip = new JSZip()

  for (let n=1; n<=doc.numPages; n++) {
    setStatus(`Merender halaman ${n} dari ${doc.numPages}…`)
    const page = await doc.getPage(n)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d', { alpha:false })
    await page.render({ canvasContext:ctx, viewport }).promise
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    zip.file(`${stripExt(file.name)}-halaman-${n}.jpg`, blob)
  }
  downloadBlob(await zip.generateAsync({ type:'blob' }), `${stripExt(file.name)}-jpg.zip`)
}

async function pdfToExcel(file) {
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjsLib.getDocument({ data }).promise
  const wb = XLSX.utils.book_new()

  for (let n=1; n<=doc.numPages; n++) {
    setStatus(`Mengekstrak halaman ${n} dari ${doc.numPages}…`)
    const page = await doc.getPage(n)
    const content = await getTextContentCompat(page)
    const items = content.items
      .filter(i => i.str && i.str.trim())
      .map(i => ({ text:i.str.trim(), x:i.transform[4], y:i.transform[5] }))

    const rows = []
    const tolerance = 3.5
    for (const item of items.sort((a,b) => b.y-a.y || a.x-b.x)) {
      let row = rows.find(r => Math.abs(r.y-item.y) <= tolerance)
      if (!row) { row = { y:item.y, cells:[] }; rows.push(row) }
      row.cells.push(item)
    }
    rows.sort((a,b) => b.y-a.y)
    const aoa = rows.map(r => r.cells.sort((a,b)=>a.x-b.x).map(c=>c.text))
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    XLSX.utils.book_append_sheet(wb, ws, `Halaman ${n}`)
  }
  XLSX.writeFile(wb, `${stripExt(file.name)}.xlsx`)
}

async function editPdf(file) {
  const sourceBytes = new Uint8Array(await file.arrayBuffer())
  const pdf = await PDFDocument.load(sourceBytes)
  const pageNum = Number(modalBody.querySelector('#pageNumber').value || 1) - 1
  if (pageNum < 0 || pageNum >= pdf.getPageCount()) throw new Error('Nomor halaman tidak valid.')

  const action = modalBody.querySelector('#editAction').value

  if (action === 'replace-text') {
    const findText = modalBody.querySelector('#findText').value
    const replacement = modalBody.querySelector('#replaceText').value
    const scope = modalBody.querySelector('#replaceScope').value
    const caseSensitive = modalBody.querySelector('#replaceCase').value === 'sensitive'

    if (!findText.trim()) throw new Error('Masukkan teks lama yang ingin diganti.')

    const pdfJsDoc = await pdfjsLib.getDocument({ data: sourceBytes }).promise
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const pageIndexes = scope === 'all'
      ? Array.from({ length: pdf.getPageCount() }, (_, i) => i)
      : [pageNum]

    let totalMatches = 0

    for (const idx of pageIndexes) {
      setStatus(`Mencari dan mengganti teks pada halaman ${idx + 1}…`)
      const jsPage = await pdfJsDoc.getPage(idx + 1)
      const textContent = await getTextContentCompat(jsPage)
      const outPage = pdf.getPage(idx)

      for (const item of textContent.items) {
        if (!item.str || !item.str.trim()) continue

        const haystack = caseSensitive ? item.str : item.str.toLowerCase()
        const needle = caseSensitive ? findText : findText.toLowerCase()

        let start = haystack.indexOf(needle)
        while (start !== -1) {
          const textLen = Math.max(item.str.length, 1)
          const itemWidth = Math.max(Number(item.width) || 0, 1)
          const ratioStart = start / textLen
          const ratioWidth = findText.length / textLen

          const x = item.transform?.[4] ?? 0
          const baselineY = item.transform?.[5] ?? 0
          const fontSize = Math.max(
            6,
            Math.min(
              72,
              Math.abs(item.transform?.[3] || 0) ||
              Math.abs(item.height || 0) ||
              12
            )
          )

          const oldX = x + itemWidth * ratioStart
          const oldWidth = Math.max(itemWidth * ratioWidth, fontSize * 0.45)
          const oldHeight = Math.max(Math.abs(item.height || 0), fontSize * 1.05)

          // Calculate a replacement size that tries to fit the old text box.
          let drawSize = fontSize
          let replacementWidth = font.widthOfTextAtSize(replacement, drawSize)
          if (replacementWidth > oldWidth && replacement.length > 0) {
            drawSize = Math.max(5, drawSize * (oldWidth / replacementWidth))
            replacementWidth = font.widthOfTextAtSize(replacement, drawSize)
          }

          // White-out the existing visual text, then draw replacement text.
          // A small padding helps cover antialiasing around glyph edges.
          outPage.drawRectangle({
            x: Math.max(0, oldX - 1.5),
            y: Math.max(0, baselineY - oldHeight * 0.22),
            width: Math.max(oldWidth + 3, replacementWidth + 3),
            height: oldHeight * 1.15,
            color: rgb(1, 1, 1),
          })

          if (replacement) {
            outPage.drawText(replacement, {
              x: oldX,
              y: baselineY,
              size: drawSize,
              font,
              color: rgb(0, 0, 0),
            })
          }

          totalMatches++
          start = haystack.indexOf(needle, start + Math.max(needle.length, 1))
        }
      }
    }

    if (!totalMatches) {
      throw new Error(
        'Teks tidak ditemukan sebagai objek teks digital. Coba potongan kata yang lebih pendek. Jika PDF berupa scan/foto, diperlukan OCR.'
      )
    }

    downloadBytes(
      await pdf.save(),
      `${stripExt(file.name)}-teks-diubah.pdf`,
      'application/pdf'
    )
    setStatus(`Selesai. <strong>${totalMatches}</strong> kemunculan teks berhasil diganti.`, 'success')
    return
  }

  if (action === 'delete') {
    if (pdf.getPageCount() <= 1) throw new Error('PDF satu halaman tidak dapat dihapus seluruhnya.')
    pdf.removePage(pageNum)
  } else if (action === 'rotate') {
    const page = pdf.getPage(pageNum)
    const add = Number(modalBody.querySelector('#rotation').value)
    const current = page.getRotation().angle || 0
    page.setRotation(degrees((current + add) % 360))
  } else {
    const text = modalBody.querySelector('#editText').value.trim()
    if (!text) throw new Error('Masukkan teks yang akan ditambahkan.')
    const page = pdf.getPage(pageNum)
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const size = Number(modalBody.querySelector('#fontSize').value || 18)
    const x = Number(modalBody.querySelector('#posX').value || 50)
    const topY = Number(modalBody.querySelector('#posY').value || 50)
    const y = page.getHeight() - topY - size
    page.drawText(text, { x, y, size, font, color:rgb(0,0,0) })
  }

  downloadBytes(await pdf.save(), `${stripExt(file.name)}-edit.pdf`, 'application/pdf')
}

async function watermarkPdf(file) {
  const pdf = await PDFDocument.load(await file.arrayBuffer())
  const font = await pdf.embedFont(StandardFonts.HelveticaBold)
  const text = modalBody.querySelector('#watermarkText').value.trim()
  if (!text) throw new Error('Masukkan teks watermark.')
  const size = Number(modalBody.querySelector('#watermarkSize').value || 48)
  const opacity = Number(modalBody.querySelector('#watermarkOpacity').value || 0.2)
  const rotation = Number(modalBody.querySelector('#watermarkRotation').value || 0)
  const position = modalBody.querySelector('#watermarkPosition').value
  const textWidth = font.widthOfTextAtSize(text, size)

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize()
    let x = (width - textWidth) / 2
    let y = (height - size) / 2
    if (position === 'top') y = height - size - 50
    if (position === 'bottom') y = 50
    page.drawText(text, {
      x, y, size, font,
      color: rgb(0.45,0.45,0.45),
      opacity,
      rotate: degrees(rotation),
    })
  }
  downloadBytes(await pdf.save(), `${stripExt(file.name)}-watermark.pdf`, 'application/pdf')
}

async function addPageNumbers(file) {
  const pdf = await PDFDocument.load(await file.arrayBuffer())
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const start = Number(modalBody.querySelector('#pageStart').value || 1)
  const size = Number(modalBody.querySelector('#pageNumSize').value || 10)
  const position = modalBody.querySelector('#pageNumPosition').value
  const format = modalBody.querySelector('#pageNumFormat').value
  const total = pdf.getPageCount()
  const margin = 28

  pdf.getPages().forEach((page, i) => {
    const current = start + i
    const label = format === 'page' ? `Halaman ${current}` :
      format === 'total' ? `${current} / ${start + total - 1}` : String(current)
    const textWidth = font.widthOfTextAtSize(label, size)
    const { width, height } = page.getSize()

    let x = margin, y = margin
    if (position.includes('center')) x = (width - textWidth)/2
    if (position.includes('right')) x = width - textWidth - margin
    if (position.startsWith('top')) y = height - size - margin

    page.drawText(label, { x, y, size, font, color:rgb(0.15,0.15,0.15) })
  })

  downloadBytes(await pdf.save(), `${stripExt(file.name)}-nomor-halaman.pdf`, 'application/pdf')
}

async function signPdf(file) {
  const sigFile = modalBody.querySelector('#signatureInput').files?.[0]
  if (!sigFile) throw new Error('Pilih gambar tanda tangan PNG/JPG terlebih dahulu.')

  const pdf = await PDFDocument.load(await file.arrayBuffer())
  const pageIndex = Number(modalBody.querySelector('#signPage').value || 1) - 1
  if (pageIndex < 0 || pageIndex >= pdf.getPageCount()) throw new Error('Nomor halaman tanda tangan tidak valid.')

  const sigBytes = new Uint8Array(await sigFile.arrayBuffer())
  const isPng = sigFile.type === 'image/png' || sigFile.name.toLowerCase().endsWith('.png')
  const image = isPng ? await pdf.embedPng(sigBytes) : await pdf.embedJpg(sigBytes)
  const page = pdf.getPage(pageIndex)
  const width = Number(modalBody.querySelector('#signWidth').value || 140)
  const ratio = image.height / image.width
  const height = width * ratio
  const x = Number(modalBody.querySelector('#signX').value || 60)
  const topY = Number(modalBody.querySelector('#signY').value || 500)
  const y = page.getHeight() - topY - height

  page.drawImage(image, { x, y, width, height })
  downloadBytes(await pdf.save(), `${stripExt(file.name)}-ditandatangani.pdf`, 'application/pdf')
}

async function lockPdf(file) {
  const userPassword = modalBody.querySelector('#userPassword').value
  const ownerPassword = modalBody.querySelector('#ownerPassword').value || userPassword
  if (!userPassword) throw new Error('Password pembuka wajib diisi.')
  const toolkit = await getToolkit()
  const out = await toolkit.lock(file, {
    userPassword,
    ownerPassword,
    keyLength: 256,
    permissions: { print:'full', modify:'all', extract:true }
  })
  downloadBytes(out, `${stripExt(file.name)}-terkunci.pdf`, 'application/pdf')
}

async function unlockPdf(file) {
  const password = modalBody.querySelector('#pdfPassword').value
  if (!password) throw new Error('Masukkan password PDF yang benar.')
  const toolkit = await getToolkit()
  const out = await toolkit.unlock(file, { password })
  downloadBytes(out, `${stripExt(file.name)}-tanpa-password.pdf`, 'application/pdf')
}

function matchesAccept(file, accept) {
  if (!accept) return true
  const rules = accept.split(',').map(x => x.trim().toLowerCase())
  const name = file.name.toLowerCase()
  const type = (file.type || '').toLowerCase()
  return rules.some(rule => rule.startsWith('.') ? name.endsWith(rule) : type === rule)
}

function isPdf(file) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

function stripExt(name) { return name.replace(/\.[^.]+$/, '') }
function replaceExt(name, ext) { return stripExt(name) + ext }

function formatBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024*1024) return `${(n/1024).toFixed(1)} KB`
  return `${(n/1024/1024).toFixed(1)} MB`
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))
}

function downloadBytes(bytes, filename, mime) {
  downloadBlob(new Blob([bytes], { type:mime }), filename)
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

function humanizeError(err) {
  const msg = String(err?.message || err || 'Terjadi kesalahan.')
  if (/password/i.test(msg)) return `Gagal memproses password PDF. Pastikan password benar. (${escapeHtml(msg)})`
  if (/encrypted/i.test(msg)) return `PDF terenkripsi. Gunakan menu "Buka/Hapus Password" terlebih dahulu.`
  return `Gagal: ${escapeHtml(msg)}`
}

searchTool.addEventListener('input', renderTools)
categoryFilter.addEventListener('change', renderTools)
renderTools()
