const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const log = require('electron-log');

log.transports.file.level = 'info';
log.transports.console.level = 'info';

let mainWindow;
let pendingFile = null;

process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception:', error);
  app.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled Rejection:', reason);
});

function createWindow(filePath = null) {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    resizable: false,
    frame: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#ffffff',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  
  mainWindow.webContents.on('did-finish-load', () => {
    if (filePath) {
      mainWindow.webContents.send('open-file', filePath);
    }
  });
  
  mainWindow.on('closed', () => mainWindow = null);
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    const filePath = commandLine.find(arg => arg.endsWith('.md') || arg.endsWith('.tex'));
    if (filePath && mainWindow) {
      mainWindow.webContents.send('open-file', filePath);
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  const args = process.argv.slice(1);
  const filePath = args.find(arg => arg.endsWith('.md') || arg.endsWith('.tex'));
  
  createWindow(filePath || null);
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    mainWindow.webContents.send('open-file', filePath);
  } else {
    pendingFile = filePath;
  }
});

function getResourcesPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar');
  }
  return path.join(__dirname, '../..');
}

function getBundledTool(name) {
  let resourcesPath;
  if (app.isPackaged) {
    resourcesPath = path.join(process.resourcesPath, 'tools');
  } else {
    resourcesPath = path.join(__dirname, '../../tools');
  }
  const toolPath = path.join(resourcesPath, name + (process.platform === 'win32' ? '.exe' : ''));
  if (fs.existsSync(toolPath)) return toolPath;
  return name;
}

function getTemplatePath() {
  let templatePath;
  if (app.isPackaged) {
    templatePath = path.join(process.resourcesPath, 'templates', 'template.tex');
  } else {
    templatePath = path.join(__dirname, '../../templates/template.tex');
  }
  if (fs.existsSync(templatePath)) return templatePath;
  return path.join(__dirname, '../templates/template.tex');
}

function findTool(name) {
  const bundled = getBundledTool(name);
  if (bundled !== name && fs.existsSync(bundled)) return bundled;
  const locations = process.platform === 'win32'
    ? ['C:\\Program Files\\Pandoc', 'C:\\Program Files (x86)\\Pandoc', path.join(app.getPath('home'), 'AppData\\Local\\Pandoc')]
    : ['/usr/local/bin', '/usr/bin', '/opt/homebrew/bin'];
  for (const dir of locations) {
    const toolPath = path.join(dir, name + (process.platform === 'win32' ? '.exe' : ''));
    if (fs.existsSync(toolPath)) return toolPath;
  }
  return name;
}

async function convertMdToTex(mdPath, outputDir) {
  const pandoc = findTool('pandoc');
  const mdContent = fs.readFileSync(mdPath, 'utf8');
  const mdDir = path.dirname(mdPath);
  
  const texTemplate = fs.readFileSync(getTemplatePath(), 'utf8');
  
  const frontmatterMatch = mdContent.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  let frontmatter = '';
  let mainContent = mdContent;
  
  if (frontmatterMatch) {
    frontmatter = frontmatterMatch[1];
    mainContent = mdContent.slice(frontmatterMatch[0].length);
  }
  
  let processedContent = mainContent
    .replace(/!\[\]\(([^)]+\.(?:png|jpg|jpeg|gif|svg|pdf))\)/g, (match, imgPath) => {
      const ext = path.extname(imgPath).toLowerCase();
      if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.gif') {
        return `\\begin{figure}[h]\n\\centering\n\\includegraphics[width=0.6\\textwidth]{${imgPath}}\n\\end{figure}`;
      }
      return match;
    })
    .replace(/\\begin\{figure\}/g, '\\begin{figure}[h]')
    .replace(/\\centering\\n\\includegraphics/g, '\\centering\\n\\includegraphics[width=0.6\\textwidth]');
  
  const tempMdPath = path.join(outputDir, 'temp_input.md');
  fs.writeFileSync(tempMdPath, processedContent, 'utf8');
  
  const tempTexPath = path.join(outputDir, 'temp_output.tex');
  
  const args = [
    '-s', '-f', 'markdown+raw_tex+tex_math_dollars',
    '-t', 'latex',
    '-o', tempTexPath,
    '--standalone',
    '--wrap=preserve',
    '--preserve-tabs',
    '--no-highlight',
    tempMdPath
  ];
  
  try {
    execSync(`"${pandoc}" ${args.join(' ')}`, { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    const fallbackArgs = [
      '-s', '-f', 'markdown',
      '-t', 'latex',
      '-o', tempTexPath,
      tempMdPath
    ];
    execSync(`"${pandoc}" ${fallbackArgs.join(' ')}`, { encoding: 'utf8', stdio: 'pipe' });
  }
  
  let generatedTex = fs.readFileSync(tempTexPath, 'utf8');
  fs.unlinkSync(tempMdPath);
  fs.unlinkSync(tempTexPath);
  
  generatedTex = generatedTex
    .replace(/\\documentclass\{article\}/, '')
    .replace(/\\begin\{document\}/, '')
    .replace(/\\end\{document\}/, '');
  
  let finalTex = texTemplate
    .replace('{{CONTENT}}', generatedTex)
    .replace('{{DATE}}', new Date().toLocaleDateString('zh-CN'));
  
  const titleMatch = frontmatter.match(/title:\s*(.+)/i);
  if (titleMatch) {
    finalTex = finalTex.replace('{{TITLE}}', titleMatch[1].trim());
  }
  
  const authorMatch = frontmatter.match(/author:\s*(.+)/i);
  if (authorMatch) {
    finalTex = finalTex.replace('{{AUTHOR}}', authorMatch[1].trim());
  }
  
  return finalTex;
}

async function compileTexToPdf(texContent, outputDir) {
  const texPath = path.join(outputDir, 'input.tex');
  fs.writeFileSync(texPath, texContent, 'utf8');
  const pdfPath = path.join(outputDir, 'output.pdf');
  const tectonic = findTool('tectonic');
  
  const runTectonic = (texFile, dir) => {
    return new Promise((resolve, reject) => {
      const args = ['--keep-intermediates', '--keep-logs', '--outdir=' + dir, texFile];
      const proc = spawn(tectonic, args, { cwd: dir, shell: true });
      let stdout = '', stderr = '';
      proc.stdout.on('data', (data) => stdout += data);
      proc.stderr.on('data', (data) => stderr += data);
      proc.on('close', (code) => {
        if (code !== 0) {
          log.error('Tectonic stderr:', stderr);
          reject(new Error('LaTeX compilation failed: ' + stderr));
        } else {
          resolve(stdout);
        }
      });
    });
  };
  
  await runTectonic(texPath, outputDir);
  
  fs.unlinkSync(texPath);
  ['.aux', '.log', '.out', '.bbl', '.blg', '.toc', '.synctex.gz'].forEach(ext => {
    const f = path.join(outputDir, 'input' + ext);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
  
  if (!fs.existsSync(pdfPath)) {
    throw new Error('PDF not generated');
  }
  
  return pdfPath;
}

ipcMain.handle('convert-file', async (event, filePath) => {
  log.info('Converting file:', filePath);
  
  const outputDir = path.join(app.getPath('temp'), 'uypora-' + Date.now());
  fs.mkdirSync(outputDir, { recursive: true });
  
  try {
    const ext = path.extname(filePath).toLowerCase();
    let texContent;
    
    if (ext === '.md') {
      texContent = await convertMdToTex(filePath, outputDir);
    } else if (ext === '.tex') {
      texContent = fs.readFileSync(filePath, 'utf8');
    } else {
      throw new Error('Unsupported file format');
    }
    
    const pdfPath = await compileTexToPdf(texContent, outputDir);
    const pdfBuffer = fs.readFileSync(pdfPath);
    
    fs.unlinkSync(pdfPath);
    fs.rmSync(outputDir, { recursive: true, force: true });
    
    return { success: true, data: pdfBuffer.toString('base64') };
  } catch (error) {
    log.error('Conversion error:', error);
    fs.rmSync(outputDir, { recursive: true, force: true });
    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Markdown/LaTeX', extensions: ['md', 'tex'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('save-pdf', async (event, base64Data) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'output.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  
  if (result.canceled) return false;
  
  const pdfBuffer = Buffer.from(base64Data, 'base64');
  fs.writeFileSync(result.filePath, pdfBuffer);
  return true;
});