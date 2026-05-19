# 当前版本为V0.8 后续更新版本功能暂未调试完成
后续功能补充详情参考pdf
# FDoc

基于 `FastAPI + OverType` 的岗位流转型 Markdown 文档编辑器示例。

## 启动

```bash
python -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
uvicorn main:app --reload
```

Windows 下也可以直接双击仓库根目录的 `start_fdoc.bat` 一键启动。

默认访问：

- `http://127.0.0.1:8000/`
- `http://127.0.0.1:8000/setup`
- `http://127.0.0.1:8000/editor`

## 环境变量

- `DASHSCOPE_API_KEY`: 千问 DashScope API Key
- `QWEN_MODEL`: 可选，默认 `qwen-plus`
- `DASHSCOPE_ENDPOINT`: 可选，默认 `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`
- `DASHSCOPE_TIMEOUT_SECONDS`: 可选，默认 `60`

未配置 `DASHSCOPE_API_KEY` 时，页面仍可打开，但点击“开始分析”会返回明确错误。
如果千问接口超时，前端会显示结构化错误提示，不会再因为非 JSON 响应导致页面报 `Unexpected token`。
