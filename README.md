# uypora

Markdown + LaTeX 转 PDF 转换器

## 功能特点

- 支持 Markdown (.md) 和 LaTeX (.tex) 文件转换为 PDF
- 基于 Pandoc + XeLaTeX
- 简洁的图形界面
- 拖拽支持

## 前置要求

在运行 uypora 之前，需要安装以下依赖：

### Windows

1. **Pandoc**: https://pandoc.org/installing.html
2. **MiKTeX** 或 **TeX Live**: 
   - MiKTeX: https://miktex.org/download
   - TeX Live: https://www.tectonic.org/

安装完成后，确保 Pandoc 和 XeLaTeX (xelatex) 已添加到系统 PATH。

## 使用方法

### 开发模式

```bash
npm install
npm run dev
```

### 构建 Windows 可执行文件

```bash
npm run build
```

构建完成后，可在 `dist` 目录中找到 `uypora.exe` 便携版。

## 许可证

MIT License