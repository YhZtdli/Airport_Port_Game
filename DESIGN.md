# ORBIS 的扩展接口

游戏分成独立的地理、环境、仿真和界面层。未来接入更高精度或商业数据时，优先替换适配器，避免把网络请求放进时间积分循环。

## 环境

server/environment.mjs 负责在真实时间轴更新数据。每个来源独立维护 status / at / count / message。天气与海洋样本形状：

    {
      point: [longitude, latitude],
      times: [UTC_timestamp_ms, ...],
      values: { wind: [km_h, ...], ... }
    }

天气字段：wind、windDir、gust、cape、visibility、code、precip。
海洋字段：wave、current、currentDir。

world.zones 接受多边形或圆形：

    {
      id: "provider-record-id",
      name: "区域显示名称",
      kind: "air",
      type: "advisory",
      severity: 0.7,
      geometry: { type: "Polygon", coordinates: [...] },
      source: "source name",
      sourceUrl: "https://provider.example/bulletin",
      expires: 1790000000000,
      approximate: true
    }

kind 可为 air、sea、both；type=closure 表示游戏规则中的强制通行受阻。真实规则必须保留来源、有效期、覆盖高度、运营主体和核验范围，不能将泛化风险公告直接视为全域关闭。需要更严格的规则时，应把高度、国籍、机型及日期条件加入 zoneAt。

## 仿真

public/js/engine.js 导出纯数据状态和 advance(state, hours, context)，每次按不超过 5 个游戏分钟的步长积分。context 提供设施索引、环境快照、海上路由函数和陆地检测。

班次主要状态：

    scheduled -> active -> completed
                       -> diverting -> servicing -> active
                                    -> cancelled（通行受阻）
                       -> stranded -> cancelled

物理位置和经济都在状态里持久化。更换数据源或界面不需要更改存档传输协议，但变更字段时应提升 version 并加入显式迁移。

## 进一步提高真实性的优先顺序

1. 增加跑道、重量、吃水和港口处理能力，让替代设施筛选更精确。
2. 将机场 / 海岸附近的空间精度提高到可校验的局部数据；加入船闸和运河通行队列。
3. 接入有授权的 NOTAM、海事通告和运营主体航权；按各自实际适用范围判断，不使用统一的国家整面假设。
4. 将单一货物依赖扩展为多批次、多前序仓储订单及需求网络。
5. 加入机组执勤、船员、维修基地、备件、真实机型性能表和合同履约。
6. 将长周期游戏世界使用的数据切换为匹配时间的历史数据 / 合成未来情景，保留来源说明。
7. 若需要多人或无人值守仿真，将 advance 移至服务端并增加账户、权限和数据库事务；当前是本机单人服务。

这些条目是扩展方向，不代表当前版本已经实现。

## 地区目录与检索

scripts/prepare-data.mjs 处理 OurAirports 的 airports / countries / regions CSV 和 GeoNames cities5000 ZIP。data-utils.mjs 支持引号和逗号的 CSV，以及 ZIP 中指定条目的内存读取，不将 ZIP 路径直接解压到磁盘。

facilities.json 保留原有稳定 id（A + 来源机场 id，P + 港口代码），新增 sourceCountry、country、continent、region、cityKey、type、closed、codes、keywords。sourceCountry 是上游标识；country 是游戏所属国家，两者不能混用。中国台湾省、中国香港、中国澳门对应 CN-TW、CN-HK、CN-MO，country 均为 CN。

directory.json 提供 continents / countries / regions / cities 四个键控表，包含中文显示名、来源英文名和别名。城市根据来源 municipality 的名称匹配，距离用于同名消歧；不直接把最近的大城市当作所在地。无匹配项保留来源城市，未知行政区单独分组。

geography.js 集中定义地区映射、显示名称和地图标准化，重新下载地图后仍会重新应用。facility-search.js 预先规范化代码、名称和地理别名，按范围、类型和在用状态过滤，提供总数与分页；精确代码匹配排在最前。facility-picker.js 负责路径导航、城市 / 行政区切换、结果加载和键盘操作，弹层挂到 body 并限制在视口内。

engine.supportsFacility 同时用于调度、在途目的地修改和备降候选筛选：直升机起降点仅供 helicopter、水上机场仅供 amphibian，停用设施不可新调度。载具性能仍是游戏近似，不代表真实型号操作手册。原有陆地机场不会因本次更新增加新的跑道约束。

prepare-data 在上游删除设施时，保留当前存档引用的旧端点作为停用记录，避免破坏已有班次。它不改写 data/save.json。现有存档中只存稳定设施 id，新地区展示无需重建游戏。


## 静态托管运行环境

runtime.js 根据 runtime-config.json 选择本机 API 或浏览器存储。本机版本保持 server.mjs；构建时只在 dist 中改成 static。相对资源路径支持 GitHub Pages 的 /仓库名/ 路径。

browser-store.js 使用 IndexedDB 事务比较存档 revision 再写入，阻止同一浏览器多窗口覆盖。命名空间包含完整网站根地址，不同站点和浏览器隔离。无持久存储权限时明确提示仅临时游玩；支持导入导出。

静态版的 /api/save 与 /api/environment 是内部适配器标识，不会形成 HTTP API 请求。每次仿真仍在玩家浏览器内计算。环境来源为公开 JSON 快照，最多每 5 分钟检查站点新文件，手动检查可立即读取；失败使用已有快照，超过有效时间会标记过期。

GitHub Actions 在云端恢复上一次公共数据缓存、调用 refresh-world.mjs、构建并发布。数据适配器只读公共全球数据，不读 data/save.json。build-static.mjs 限定输出为项目内自有 dist 目录，verify-static.mjs 校验压缩文件和公开文件范围。详情见 DEPLOY.md。
