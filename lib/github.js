// Ambil repo GitHub (public/private) sebagai folder project untuk dikemas menjadi produk.
// Memakai GitHub REST API + tarball, jadi server tidak perlu punya `git`.
// Repo private butuh GITHUB_TOKEN di .env (fine-grained token, izin Contents: Read-only).
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const API = 'https://api.github.com';
const MAX_REPO_KB = 300 * 1024; // 300 MB (ukuran repo menurut GitHub, sebelum dibersihkan)

class GitHubError extends Error {}

// Menerima: https://github.com/owner/repo, github.com/owner/repo.git, owner/repo,
// https://github.com/owner/repo/tree/<branch>. Mengembalikan { owner, repo, ref } atau null.
function parseRepoUrl(input) {
  const s = String(input || '').trim().replace(/^git@github\.com:/, 'github.com/').replace(/\.git$/, '');
  // username GitHub hanya huruf/angka/strip (tanpa titik), jadi host lain seperti gitlab.com tidak lolos
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?(?:github\.com\/)?([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)(?:\/tree\/([^\s?#]+))?\/?(?:[?#].*)?$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], ref: m[3] ? decodeURIComponent(m[3]) : null };
}

function headers() {
  const h = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'sourcecode-market', 'X-GitHub-Api-Version': '2022-11-28' };
  if (process.env.GITHUB_TOKEN) h.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  return h;
}

async function api(pathname) {
  let res;
  try {
    res = await fetch(API + pathname, { headers: headers(), signal: AbortSignal.timeout(30000) });
  } catch (e) {
    throw new GitHubError('Tidak bisa menghubungi GitHub: ' + e.message);
  }
  if (res.status === 404) {
    throw new GitHubError(process.env.GITHUB_TOKEN
      ? 'Repo tidak ditemukan. Periksa URL-nya, dan pastikan GITHUB_TOKEN punya akses ke repo ini.'
      : 'Repo tidak ditemukan. Kalau repo-nya private, isi GITHUB_TOKEN di file .env lalu restart server.');
  }
  if (res.status === 401) throw new GitHubError('GITHUB_TOKEN ditolak GitHub (salah atau kedaluwarsa). Periksa nilainya di .env.');
  if (res.status === 403 || res.status === 429) throw new GitHubError('GitHub membatasi permintaan (rate limit). Isi GITHUB_TOKEN di .env, atau coba lagi beberapa menit lagi.');
  if (!res.ok) throw new GitHubError(`GitHub menjawab ${res.status} ${res.statusText}.`);
  return res.json();
}

async function getRepoInfo(owner, repo) {
  const r = await api(`/repos/${owner}/${repo}`);
  if (r.size > MAX_REPO_KB) throw new GitHubError(`Repo terlalu besar (${Math.round(r.size / 1024)} MB). Batas impor 300 MB — kecilkan repo (buang aset besar/binary) atau upload zip manual.`);
  return { owner: r.owner.login, repo: r.name, fullName: r.full_name, url: r.html_url, description: r.description || '', defaultBranch: r.default_branch, private: !!r.private, language: r.language || '', sizeKb: r.size };
}

async function getLanguages(owner, repo) {
  try { return Object.keys(await api(`/repos/${owner}/${repo}/languages`)); } catch { return []; }
}

// Unduh tarball lalu ekstrak ke folder sementara. Mengembalikan { dir, cleanup }.
// dir = folder project (isi repo), bukan folder sementaranya.
async function downloadRepo(owner, repo, ref) {
  let res;
  try {
    res = await fetch(`${API}/repos/${owner}/${repo}/tarball/${encodeURIComponent(ref)}`, { headers: headers(), redirect: 'follow', signal: AbortSignal.timeout(180000) });
  } catch (e) {
    throw new GitHubError('Gagal mengunduh repo: ' + e.message);
  }
  if (res.status === 404) throw new GitHubError(`Branch/tag "${ref}" tidak ada di repo ini.`);
  if (!res.ok) throw new GitHubError(`Gagal mengunduh repo: GitHub menjawab ${res.status}.`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-'));
  const cleanup = () => fs.rmSync(tmp, { recursive: true, force: true });
  try {
    const tarPath = path.join(tmp, 'repo.tar.gz');
    fs.writeFileSync(tarPath, Buffer.from(await res.arrayBuffer()));
    const out = path.join(tmp, 'src'); fs.mkdirSync(out);
    execSync(`tar -xzf "${tarPath}" -C "${out}"`);
    fs.rmSync(tarPath, { force: true });
    // tarball GitHub selalu berisi satu folder teratas: owner-repo-<sha>/
    const top = fs.readdirSync(out).find(n => fs.statSync(path.join(out, n)).isDirectory());
    if (!top) throw new GitHubError('Arsip repo kosong.');
    return { dir: path.join(out, top), cleanup };
  } catch (e) {
    cleanup();
    throw e instanceof GitHubError ? e : new GitHubError('Gagal mengekstrak repo: ' + e.message);
  }
}

// "toko-online-laravel" -> "Toko Online Laravel"
function titleFromRepoName(name) {
  return name.replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase());
}

const FRAMEWORKS = [
  // [file, pola di isi file, label]
  ['package.json', /"next"\s*:/, 'Next.js'], ['package.json', /"nuxt"\s*:/, 'Nuxt'], ['package.json', /"react"\s*:/, 'React'], ['package.json', /"vue"\s*:/, 'Vue'],
  ['package.json', /"svelte"\s*:/, 'Svelte'], ['package.json', /"@angular\/core"\s*:/, 'Angular'], ['package.json', /"express"\s*:/, 'Express'], ['package.json', /"@nestjs\/core"\s*:/, 'NestJS'],
  ['package.json', /"fastify"\s*:/, 'Fastify'], ['package.json', /"tailwindcss"\s*:/, 'Tailwind CSS'], ['package.json', /"bootstrap"\s*:/, 'Bootstrap'], ['package.json', /"prisma"\s*:/, 'Prisma'],
  ['package.json', /"mongoose"\s*:/, 'MongoDB'], ['package.json', /"mysql2?"\s*:/, 'MySQL'], ['package.json', /"pg"\s*:/, 'PostgreSQL'], ['package.json', /"better-sqlite3"|"sqlite3"/, 'SQLite'],
  ['composer.json', /"laravel\/framework"/, 'Laravel'], ['composer.json', /"codeigniter4?\//, 'CodeIgniter'], ['composer.json', /"symfony\/framework-bundle"/, 'Symfony'], ['composer.json', /"livewire\/livewire"/, 'Livewire'],
  ['requirements.txt', /^django/im, 'Django'], ['requirements.txt', /^flask/im, 'Flask'], ['requirements.txt', /^fastapi/im, 'FastAPI'],
  ['pubspec.yaml', /^\s*flutter:/m, 'Flutter'], ['go.mod', /gin-gonic\/gin/, 'Gin'], ['go.mod', /labstack\/echo/, 'Echo'], ['Gemfile', /rails/, 'Rails'],
];

// Tech stack: framework/library yang terdeteksi dari file dependensi + bahasa utama menurut GitHub.
// File dependensi dicari di root dan satu level di bawahnya (monorepo: backend/, frontend/, dll).
function detectStack(dir, languages) {
  const found = [];
  const dirs = [dir, ...fs.readdirSync(dir).map(n => path.join(dir, n)).filter(p => fs.statSync(p).isDirectory() && !/^(node_modules|vendor|\.git)$/.test(path.basename(p)))];
  const cache = {};
  for (const [file, re, label] of FRAMEWORKS) {
    if (!(file in cache)) cache[file] = dirs.map(d => path.join(d, file)).filter(p => fs.existsSync(p)).map(p => fs.readFileSync(p, 'utf8')).join('\n');
    if (cache[file] && re.test(cache[file]) && !found.includes(label)) found.push(label);
  }
  // Bahasa: buang markup/style yang tidak informatif, ambil maksimal 3
  const langs = languages.filter(l => !/^(HTML|CSS|SCSS|Blade|EJS|Dockerfile|Shell|Makefile|Procfile|Batchfile)$/.test(l)).slice(0, 3);
  for (const l of langs) if (!found.includes(l)) found.push(l);
  return found.join(', ');
}

// Ambil deskripsi & daftar fitur dari README (markdown -> teks polos sederhana)
function readReadme(dir) {
  const name = fs.readdirSync(dir).find(n => /^readme(\.md|\.markdown|\.txt)?$/i.test(n));
  if (!name) return { description: '', features: '' };
  const md = fs.readFileSync(path.join(dir, name), 'utf8');

  // Fitur: bullet di bawah heading "Fitur"/"Features", termasuk sub-heading di dalamnya,
  // berhenti di heading berikutnya yang levelnya sama/lebih tinggi
  let features = '';
  const sections = md.split(/^(?=#{1,4}\s)/m); // tiap potongan diawali heading-nya sendiri
  const level = s => (s.match(/^(#{1,4})\s/) || [, ''])[1].length;
  const start = sections.findIndex(s => /^#{1,4}\s*[^\n]*(fitur|features?)/i.test(s));
  if (start >= 0) {
    const body = [sections[start]];
    for (let i = start + 1; i < sections.length && level(sections[i]) > level(sections[start]); i++) body.push(sections[i]);
    features = body.join('\n').split('\n').map(l => l.match(/^\s*(?:[-*+]|\d+\.)\s+(.*)$/)).filter(Boolean)
      .map(m => plainText(m[1])).filter(Boolean).slice(0, 20).join('\n');
  }

  const description = plainText(md
    .replace(/```[\s\S]*?```/g, '')                  // blok kode
    .replace(/^\s*(?:!\[[^\]]*\]\([^)]*\)\s*)+$/gm, '') // baris badge/gambar
    .replace(/<[^>]+>/g, '')                          // tag html
  ).replace(/\n{3,}/g, '\n\n').trim().slice(0, 3000);
  return { description, features };
}

function plainText(md) {
  return md
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '')        // definisi referensi link: [npm-url]: https://...
    .replace(/!\[[^\]]*\](\([^)]*\)|\[[^\]]*\])/g, '')  // gambar/badge, gaya inline maupun referensi
    .replace(/\[([^\]]*)\](\([^)]*\)|\[[^\]]*\])/g, '$1') // link -> teksnya saja
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__|`)/g, '')
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, '$1$2') // *miring* -> miring
    .replace(/^\s*[-*+]\s+/gm, '- ')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

module.exports = { parseRepoUrl, getRepoInfo, getLanguages, downloadRepo, titleFromRepoName, detectStack, readReadme, GitHubError };
