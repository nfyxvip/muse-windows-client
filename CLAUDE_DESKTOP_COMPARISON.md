# Claude Desktop 对照分析：我们的 Windows 客户端能借鉴什么

> 调研日期：2026-11-14。只写能核实的，不编功能。
> 前提（和 `FEATURE_ANALYSIS.md` 一样）：我们的客户端只是一个 Electron 壳子，打开网页版 muse.ai，**没有 Muse 官方后端接口，也没有本地模型**。Claude Desktop 很多能力是"官方客户端 + Anthropic 后端 + 模型"三方配合实现的，单靠壳子复制不了。下面每一项都如实标注。

---

## 1. Claude Desktop 功能清单（附来源）

### (a) 三个工作面：Chat / Cowork / Code

Claude Desktop 里现在是三个标签页（Anthropic 官方教程，academy.claude.com《How you'll work with Claude on your desktop》）：

| 工作面 | 是什么 | 谁能用 |
|---|---|---|
| **Chat（聊天）** | 一问一答的对话，和 claude.ai 网页版一样，另加桌面独有的快捷入口、截屏、听写、本地连接器 | 所有套餐，免费版也能聊 |
| **Cowork（交办任务）** | 把一整件多步骤的工作交出去：读文件夹、跨工具汇总、按计划产出成品文件，跑完回来验收；可定时、可并行子代理 | Pro、Max、Team、Enterprise（付费） |
| **Code（写代码）** | Claude Code 的图形界面：直接在代码库里读、改、跑命令、跑开发服务器；可视化 diff、内置终端、Git 回滚；本地文件夹或云端 GitHub 仓库两种模式；多会话并行 | Pro、Max、Team、Enterprise（付费） |

**2026 年 9 月 16 日起，Chat 和 Cowork 正在合并成一个 Claude**（Anthropic 公告，多家对照文章 2026-10~11 月复述）：不再由用户选模式，Claude 自己判断一次请求是"聊聊"还是"交办"。合并是分批推送的，不同账号到账时间不一样。

### (b) Chat：桌面独有的东西

（来源：Anthropic 官方教程 academy.claude.com；细节出处见各行）

| 功能 | 内容 | 备注 |
|---|---|---|
| Quick entry（快捷入口） | Mac 上双击 Option 键，从任意应用上方弹出一个小输入框；可拖拽框选截屏、点一个窗口分享内容 | **Mac 才有，Windows 上没有**（多家对照文章引 Anthropic 帮助中心，2026-09~11 月核对） |
| 截屏 / 窗口分享 | 在快捷入口里截屏或分享一个窗口，让 Claude 看到你看到的 | 教程里标注 (Mac) |
| 听写（Dictation） | 在快捷入口里按 Caps Lock 说话转文字 | 教程里标注 (Mac)；需 macOS 14+；默认关闭 |
| 语音对话（Voice mode） | 和 Claude 语音对话、听语音回复；聊天窗口右下角声波图标开启 | Beta，所有套餐（第三方指南引帮助中心，未在官方页亲自核实） |
| 桌面连接器 | 接本地工具和服务（见 (d) MCP） | 桌面独有 |

### (c) Cowork：把活儿交出去

（来源：Anthropic 官方教程 academy.claude.com；时间线来自多家对照文章复述 Anthropic 公告）

- **本地文件夹访问**：指一个文件夹给 Claude，它在里面读、改、建文件，成品直接存回原处，不用下载再整理。这是和 Chat 最大的区别：Chat 只能读你上传的东西，成品以下载形式交给你。
- **定时任务**：一次设置、按节奏跑（每天简报、每周汇总、周一收件箱整理）。定时任务在云端跑，电脑关了也能跑；**但任务要用本机文件时，必须保持桌面应用开着**，Claude 才能通过应用够到文件夹。
- **子代理（Subagents）**：大任务拆给多个后台 worker 并行做，各自有自己的上下文，最后合成一个成品交给你。
- **项目（Projects）**：把相关任务归到一个工作区，自带文件、指令和记忆。
- **浏览器使用**：用 "Claude in Chrome" 上网找资料、拉没有 API 的页面数据。
- **电脑使用（Computer use）**：没有连接器可用时，Claude 直接操作你的电脑——点、打字、开应用；每碰一个应用都要先问你，有黑名单。**研究预览（research preview），Pro / Max 套餐。**
- **插件（Plugins）**：把技能（skills）、连接器、子代理打包成一个"岗位包"（销售、财务、法务等），在 Customize → Plugins 里安装。

**Cowork 在哪里跑（2026 年 10 月 6 日之后变了）：**

- 2026 年 1 月 12 日：Cowork 以研究预览在 Mac 上线（Max 用户），任务在本机跑，代码跑在桌面应用起的一个 Linux 虚拟机里；Windows 上由后台服务 `cowork-svc.exe` 负责。
- 2026 年 4 月 9 日：Mac 和 Windows 正式发布；7 月 7 日上网页和手机。
- **2026 年 10 月 6 日起：Pro / Max / Ultra 的新任务改在 Anthropic 的云端跑**，本机只跑的选项被拿掉了，改不回去。之前已开始的本地任务留在本机跑完。文件夹还在你电脑上，Claude 只能在桌面应用开着时、通过应用够到你连过的那几个文件夹；**所有打开的东西（包括本地文件）都在 Anthropic 的服务器上处理**，不是留在你设备上。
- 2026 年 9 月 16 日合并公告后，Cowork 正在并进普通对话；Enterprise 版 2026 年 10 月 23 日起正式可用。

### (d) MCP 与连接器：Claude 接入外部世界的两条路

（来源：claude.com/docs/plugins/platform-support，2026-11-12 更新；Anthropic 官方教程；MCP 项目文档）

**两条路的区别是关键：**

| 路 | 是什么 | 在哪能用 |
|---|---|---|
| **远程连接器（Remote MCP / Custom connectors）** | 连一个网上的 MCP 服务器（Notion、Linear、你自己的服务器等）；在 Claude 的连接器目录里一点即装，OAuth 授权 | 网页、桌面、手机都能用；免费版限 1 个自定义连接器 |
| **本地 MCP 服务器（Local MCP）** | 在你自己电脑上跑的 MCP 服务器进程，能碰本地文件、本地数据库、本地应用 | **只有桌面应用能用**，网页和手机用不了 |

**本地 MCP 的两种装法：**

1. **桌面扩展（Desktop Extensions，`.mcpb` 文件）**：一键安装。设置 → Extensions 里从 Anthropic 审核过的目录安装，或把 `.mcpb` 文件拖进去安装。`.mcpb`（MCP Bundle）就是一个打包好的本地 MCP 服务器 + 清单文件；2025 年 9 月由旧格式 `.dxt` 改名而来。Claude Desktop 内置了 Node.js，所以 Node 写的扩展不用另外装工具链；扩展要的 API Key 存在系统钥匙串里，不写明文配置。Team / Enterprise 的管理员可以白名单 / 拉黑扩展。
2. **手写配置文件 `claude_desktop_config.json`**：开发者路线，自己写 JSON 声明要启动的本地服务器（例如官方参考实现 `@modelcontextprotocol/server-filesystem`，给 Claude 读写你指定的几个文件夹）。

**连接器目录有多大**：Anthropic 的官方连接器目录 2026 年 9 月 23 日有 **830 个**连接器（第三方统计，2026 年 5 月是 414 个）。官方第一方连接器：Google Drive、Gmail、Google Calendar、GitHub、Microsoft 365、Slack。另有 8 个"互动连接器"（Asana、Figma、Slack、Canva 等）能在对话里直接渲染出可操作的小应用界面。

**插件（Plugins）里有什么**（官方文档 claude.com/docs/plugins/platform-support）：

| 插件组件 | Chat | Cowork | Claude Code |
|---|---|---|---|
| 技能 Skills（`SKILL.md`） | 加载 | 加载 | 加载 |
| 命令 Commands | 当作技能加载 | 加载 | 加载 |
| 子代理 Agents（`agents/*.md`） | 忽略 | 加载 | 加载 |
| 钩子 Hooks | 忽略 | 加载 | 加载 |
| 远程 MCP 服务器 | 加载 | 加载 | 加载 |
| 本地 MCP 服务器（含 `.mcpb`） | 忽略 | 加载（仅会话在本机跑时） | 加载 |

也就是说：**技能和远程连接器处处都能用；子代理、钩子和本地 MCP 只在"干活"的地方（Cowork、Code）生效，普通聊天里不加载。**

### (e) 平台与系统要求

- 下载：claude.com/download，免费；macOS、Windows（x64 和 arm64）、Linux（beta，Ubuntu 22.04 / Debian 12）。
- 最低系统：macOS 13+、Windows 10+；Linux beta 只要 Ubuntu 22.04 / Debian 12。
- 套餐：聊天免费；Cowork 和 Code 要付费（Pro $20/月起）；电脑使用是 Pro / Max 的研究预览。
- Windows 上 Cowork（本地模式）需要管理员权限安装 + 开启"虚拟机平台"功能（帮助中心，多家文章复述；云端模式改了之后这条对新任务意义变小了）。
- Claude Desktop 本身是 Electron 应用（第三方 2026-11-04 读 Mac 安装包确认，非 Anthropic 官方说法）。

---

## 2. 对照我们的客户端：已有 / 能做 / 做不了

我们的客户端现状（v0.7.3，2026-11-14）：Electron 壳子打开 muse.ai；托盘、全局快捷键（可改）、Quick chat、悬浮按钮、通知开关、文件拖放、授权文件夹、文件名搜索、听写（在线语音识别，结果只进剪贴板）、截屏（区域/整屏/窗口+精确裁剪）、相机、白名单本地操作（记事本/计算器/资源管理器/浏览器，每次确认）、云端服务入口（走 muse.ai 官方连接器）、自动更新、NSIS 安装包。

### (a) 已经有了（和 Claude Desktop 对得上，甚至更好）

| Claude Desktop 有 | 我们已经有 | 说明 |
|---|---|---|
| Quick entry（Mac 才有） | Quick chat（`Ctrl+Alt+Q`）+ 悬浮按钮 | **Windows 上我们反而比 Claude 强**：Claude 的快捷入口没有 Windows 版，我们的 Quick chat 和悬浮按钮在 Windows 上能用 |
| 听写（Mac 才有） | 听写窗口（`Ctrl+Alt+D`，中/英文） | 我们的听写在 Windows 上能用，Claude 的听写是 Mac 才有；但我们只做到"识别结果进剪贴板"，没有语音对话（听 Claude 说话） |
| 截屏给模型看 | 区域截屏（双击复制） | 效果一样：都是把屏幕内容变成能发给模型的东西；我们是用户主动截了粘贴，Claude 是在快捷入口里直接附加 |
| 连接器（Gmail、Drive、Slack……） | 云端服务入口（走 muse.ai 官方连接器） | 思路一样：授权走官方连接器，客户端不存密码。Muse 的连接器目录比 Claude 小，但 Gmail/Outlook/日历这些常用的都有 |
| 通知（运行时） | 通知开关 + 测试通知 | 一样：应用关掉后都没有推送 |
| 自动更新 | electron-updater + GitHub Releases | 一样；我们没有代码签名，SmartScreen 会警告，Claude 是官方签名安装包 |
| 安装包 | NSIS 安装包 + portable 版 | Claude 是官方安装包 / Microsoft Store；我们是自己打的 NSIS，没有签名 |

### (b) 能做（Electron / Windows 技术上能做）

**注意：下面"能做"指的是客户端本地那一半能做；"模型那一半"（让云端 agent 直接用这些能力）做不了，见 (c)。**

| 想法 | 怎么做 | 价值 |
|---|---|---|
| **本地任务执行器（Runner）** | 客户端加一个"执行任务"功能：Edison 在聊天里给出一份命令清单（例如 `php -S`、composer、git、测试命令），用户点一下确认，客户端在授权文件夹里按顺序执行，把输出存成报告或进剪贴板，用户贴回聊天给 Edison 检查 | **最大的一块。** 这就是"服务端 agent + 客户端 agent"的闭环里本地那一半，见第 3 节 |
| **本地定时任务** | 客户端里设"每天 9:00 打开店铺后台""每周备份一次数据库文件夹"，到点自动执行（应用开着时）；比云端定时简报多一个"本地动作" | 小而实用；Edison 的云端定时简报管"信息"，客户端定时任务管"本地动作" |
| **文件打包发送** | 一键把授权文件夹（或选中的几个文件）打包成文本/清单进剪贴板或生成一个文件，直接发给 Edison，不用一个一个拖 | 解决现在"发文件给 Edison"最麻烦的一步；CI4 项目马上能用 |
| **本地自动化白名单扩展** | 白名单加 VS Code、终端等；执行前照样每次确认 | 只有 mingzhen 点名要才做；白名单越大风险越大，宁缺毋滥 |
| **截屏直达聊天** | 现在截屏是复制到剪贴板再粘贴；可以加一步"截完直接以文件形式进聊天输入框" | 体验小改进；最终能不能上传还是由 muse.ai 网页决定 |
| **语音对话（听模型说话）** | 用浏览器语音合成把聊天内容读出来 | 价值低：muse.ai 网页本身没有语音回复，读屏式的朗读用处不大；先不做 |
| **接管浏览器（Claude in Chrome 那种）** | 用 Chrome DevTools 协议连用户已开的 Chrome（要用户手动用调试端口启动 Chrome） | 能做但体验差、风险高；先不做 |

### (c) 做不了（要官方后端接口，或要一个本地模型，我们都没有）

| Claude Desktop 有 | 为什么我们做不了 |
|---|---|
| **Cowork：云端 agent 直接读写本机文件夹** | 需要两样东西：① Muse 后端要认识这台 Windows 电脑（设备配对）；② 后端 agent 要有权限通道。我们都没有。Muse 的云端 agent（Edison）住在虚拟机里，它够不着 mingzhen 的 Windows 电脑 |
| **Code：agent 直接改代码、跑命令、看 diff** | 同上。Edison 只能在它自己的虚拟机里改代码、跑测试；mingzhen Windows 电脑上的 CI4 项目文件夹，Edison 碰不到 |
| **电脑使用：云端 agent 点你的屏幕、开你的应用** | 需要官方的"电脑使用"通道 + 屏幕画面回传。我们没有；本地自动化只能是用户自己点的 |
| **本地 MCP 服务器 / 桌面扩展** | MCP 需要一个"模型客户端"来消费这些工具。Claude Desktop 里消费工具的是 Claude 模型；我们的客户端里**没有模型**，装 MCP 服务器没人用。借鉴的应该是它的"工具 + 权限 + 审批"设计思想，而不是 MCP 本身 |
| **插件/技能系统（Skills）** | 技能是给模型的指令文件，让模型按固定套路干活。我们的客户端没有模型，技能文件没人读。能做的只是本地的"快捷操作模板"（见 (b)） |
| **定时云端任务** | Muse 云端 agent 的定时工作由 Edison 的定时任务负责，不在客户端里；客户端只能做"应用开着时的本地定时" |
| **推送通知（应用关掉后）** | 要走 Muse 后端，壳子发不出来 |
| **语音对话的模型语音** | 模型语音要由模型方提供，壳子合成不了 Muse 的声音 |

**一句话总结：Claude Desktop 的价值来自"模型能直接碰到你的电脑"。我们的客户端没有模型，所以它的价值只能来自"帮用户把本地的事做顺"，再由用户把结果带回聊天。**

---

## 3. 服务端 agent + 客户端本地 agent 一起干活：能怎么配合

### 先说清楚通道

Edison（服务端 agent，住在云端虚拟机）和 Windows 客户端之间**没有直接通道**：

- Edison 不能直接调用客户端，客户端也不能直接调用 Edison。
- 唯一的桥是 **mingzhen 本人**：聊天消息、剪贴板、文件。
- 这不是缺陷，是安全设计：任何一方都不该在用户不知情时动另一方的东西。所有交接都要经过用户点一下。

在这个前提下，分工是这样的：

| 事情 | 谁做 | 为什么 |
|---|---|---|
| 写代码、改代码、跑测试、部署、查资料、定时简报 | Edison（服务端） | 在自己的虚拟机里有完整的开发环境（PHP、Composer、MariaDB），改完能直接验证 |
| 读写 mingzhen Windows 电脑上的文件、跑本地命令、截屏、开应用 | 客户端本地执行 | 只有客户端在那台电脑上；Edison 够不着 |
| 决定"做什么"、点"执行"、验收结果 | mingzhen | 用户是唯一的桥，也是唯一的审批人 |

### 具体能跑起来的三个配合模式

**模式一：任务包往返（最推荐，CI4 电商项目马上能用）**

1. mingzhen 在聊天里说要做什么（例如"给商品列表加个按价格排序"）。
2. Edison 在云端写好代码、跑通测试，给出两种东西：① 改动说明（给人看的）；② 一份"本地执行清单"（给客户端看的，例如：把这几个文件复制到项目文件夹 → 跑 `composer install` → 跑测试命令）。
3. mingzhen 点一下，客户端按清单在授权文件夹里执行，输出结果存成报告。
4. mingzhen 把报告贴回聊天，Edison 检查，没问题就收工，有问题再改一轮。

现在缺的只有第 3 步的"本地执行器"（第 2 节 (b) 第一行）。这一步做好，"双 agent"就转起来了。

**模式二：本地跑，云端审**

- 本地跑测试、跑开发服务器、备份数据库——这些事只能在 mingzhen 的电脑上做，客户端负责跑。
- 跑完的结果（测试报告、报错截图、日志）发给 Edison，Edison 负责看、负责改、负责出新版。
- 分工口诀：**本地动手，云端动脑**。

**模式三：定时分工**

- Edison 的云端定时任务（例如早上 9 点简报）负责"信息"：项目进度、待办提醒。
- 客户端的本地定时任务负责"动作"：到点备份、到点打开店铺后台、到点清理临时文件。
- 两边各干各的，互不依赖，合起来就是一整套"每天自动跑起来的工作流"。

### 明确不做的

- 客户端**不**直接调 Edison 的接口（没有这个接口，也不该有）。
- Edison **不**直接指挥客户端跑命令（没有通道；就算有，也不该绕过用户）。
- 本地执行的命令必须走白名单 + 每次用户确认；Edison 给的清单里出现白名单外的命令，客户端要拒绝并提示。

---

## 4. 推荐的优先级

| 优先级 | 做什么 | 为什么先做 | 依赖 |
|---|---|---|---|
| P0（已定） | 这份对照调研 | 决定做不做、做什么的依据，不写代码 | 无 |
| **P1** | **本地任务执行器**：执行 Edison 给的命令清单（白名单 + 每次确认 + 输出报告） | "双 agent"闭环里缺的唯一一块；CI4 项目马上能用；复用现有的白名单和确认弹窗，工作量不大 | mingzhen 确认：清单里允许哪些命令（php、composer、git……） |
| **P2** | **本地定时任务**：到点自动做本地动作 | 小而实用；和 Edison 的云端简报互补 | 无 |
| **P3** | **文件打包发送**：一键把授权文件夹/选中文件整理好发给 Edison | 解决现在发文件最麻烦的一步；CI4 项目每天都用得上 | 无 |
| P4 | 白名单加 VS Code 等 | 只有 mingzhen 点名要才做 | mingzhen 一句话 |
| P5（暂缓） | 语音对话、接管浏览器 | 价值低、风险高 | 暂不做 |
| 不做 | MCP 服务器宿主、本地大模型、云端 agent 直接指挥本机、读私有本地库（WhatsApp/微信/PST） | 没有模型消费 MCP；本地模型太重；没有官方通道；读私有库是红线 | — |

**值不值得的判断标准**（mingzhen 2026-11-14 问过"做这个客户端有没有意义"）：

- Claude Desktop 的对照说明了一件事：桌面客户端的价值不在"是个窗口"，而在"模型能碰到你的电脑"。我们的客户端没有模型，所以它的价值只来自本地那几件事（执行、定时、发文件）。
- 判断方法：用几天 v0.7.3，看 Quick chat、截屏、听写是不是天天用；P1–P3 做出来后，看"本地执行器"是不是每周都在用。如果是，继续做就有意义；如果基本没碰，就停下来，把精力放电商网站上。

---

## 5. 未能核实的事

- **Quick entry 有没有 Windows 版**：多家对照文章引 Anthropic 帮助中心说"Mac 才有"，我没有亲自读到帮助中心原文；只能说"据多家复述，Windows 上没有"。
- **自定义 `.mcpb` 扩展的套餐限制**：有资料说自定义扩展仅限 Team / Enterprise 套餐，也有资料说所有套餐都能装目录里的扩展；两者说法不一致，未能核实。目录扩展和自定义扩展的套餐边界以 Anthropic 帮助中心为准。
- **Chat 与 Cowork 合并的推送进度**：Anthropic 说 2026 年 9 月 16 日起分批推送，不同账号到账时间不同；mingzhen 如果装 Claude Desktop，不一定立刻看到合并后的界面。
- **Claude Desktop Windows 版的上线日期**：有文章写 2026 年 2 月 10 日，也有文章写更早；说法不一致，本文不采信具体日期。
- **语音对话（Voice mode）在 Windows 上的细节**：第三方指南引帮助中心说"Beta、所有套餐"，未在官方页亲自核实。
- **电脑使用（Computer use）在 Windows 上的可用性**：多家文章写"Pro / Max 的研究预览"，未在官方页亲自核实。
- **"Claude Desktop 是 Electron 应用"**：第三方 2026-11-04 读 Mac 安装包确认，不是 Anthropic 官方说法；不影响结论（Electron 能不能做到这些功能，我们已经用自己的客户端验证过了）。

---

## 6. 来源

**Anthropic 官方：**

- Anthropic 学院《How you'll work with Claude on your desktop》（Chat / Cowork / Code 三个工作面、快捷入口、听写、截屏、定时任务、子代理、电脑使用、插件）：https://academy.claude.com/courses/claude-101/claude-desktop-app-chat-cowork-code
- Claude 文档《Plugin feature support across platforms》（插件组件在各端的支持情况，2026-11-12 更新）：https://claude.com/docs/plugins/platform-support
- Claude Code 文档《Desktop application》（Code 标签页说明）：https://code.claude.com/docs/en/desktop-changelog

**第三方对照文章（均注明引 Anthropic 帮助中心/文档，2026-09~11 月核对；具体数字和日期以 Anthropic 官方为准）：**

- Claude Desktop 功能与 MCP 总览：https://kevinwelter.com/en/blog/claude-desktop
- Claude Desktop vs 网页版：https://stashbase.ai/blog/claude-desktop-vs-web/
- Claude Desktop 安装与系统要求：https://www.ai-toolbox.co/claude-management-and-productivity/how-to-install-claude-desktop-computer-use-2026
- Claude Desktop 2026 指南（Chat / Cowork / Code、MCP 配置）：https://www.bestgeneralaiagents.com/blog/claude-desktop-2026-guide/
- Claude Cowork 与聊天合并：https://claudefolio.com/blog/claude-cowork-vs-chat-and-what-changes-now-that-theyre-merging
- Claude Cowork 与 Claude Code 对比：https://useharris.com/blog/claude-cowork-vs-claude-code/
- Claude Cowork 商业版分析（含时间线）：https://www.avatarstudios.com.au/claude-cowork-for-business/
- Claude 连接器指南（830 个连接器，2026-09-23）：https://beginnersinai.org/claude-connectors/
- Claude Desktop MCP 配置（.mcpb、claude_desktop_config.json）：https://mcp.so/blog/claude-desktop-mcp 、https://www.mcpstepbystep.com/learn/claude-desktop/
- MCP 客户端对比：https://pondero.ai/mcps/guides/mcp-client-comparison/
- Claude 连接器设置与安全：https://neuraltrust.ai/blog/claude-connectors
