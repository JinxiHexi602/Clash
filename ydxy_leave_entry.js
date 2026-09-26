/**
 * ydxy_leave_entry.js
 * ---------------------------------------------------------------------------
 * Loon Response Script
 *
 * 作用：在「移动学工」(ydxy.gzpt.edu.cn) 的 事务待办 →「我的申请」列表顶部，
 *      插入一条 "学生请假申请" 入口。点击该行会直接进入请假申请表单（新建态）。
 *
 * 目标接口
 *   GET https://ydxy.gzpt.edu.cn:6870/ydxg/api/sm-mobile/processCenter/queryBpmApplyedProcess
 *
 * 原始响应
 *   {"data":{"pageNum":1,"pageSize":10,"total":10,"pageCount":1,"list":[{...}]},
 *    "message":"操作成功","code":200}
 *
 * 只改本地响应体，不产生任何写请求，不改动服务器上的数据。
 *
 * ---------------------------------------------------------------------------
 * 前端契约（逆向自 assets/js/chunk/p__processCenter__index.3cfdcdee.chunk.js）
 *
 *   列表数据 model（p__processCenter__model.js）：
 *     applyedProcessList = [...已有, ...res.data.list]      ← 累加拼接
 *     applyedpageInfo    = { total: res.data.total,
 *                            hasMore: res.data.pageCount > pageNum }
 *     → 因此只在 pageNum=1 注入，否则翻页会重复注入。
 *
 *   卡片渲染（"我的申请" 分支）：
 *     cardHeader  <- e.lcmc
 *     cardBody    <- "申请时间：" + e.sqsj
 *     signal      <- e.dqjd ? (e.dqjd==="审核通过"||e.dqjd==="审核不通过" ? ""
                                                    : "当前节点："+e.dqjd) : ""
 *     dqjd==="审核通过" → 打勾图 ; ==="审核不通过" → 打叉图
 *
 *   行点击：
 *     e.bdsjfsdm === "02"  → toRestfulBpmPage(e.lcsqid)  然后 window.location.href
 *     否则                  → <Link to={"/process/apply/" + e.lcid + "/" + e.lcsqid}
 *                                    + "?type=applyedProcess"} />
 *
 *   删除按钮：
 *     e.sqrbh === 当前用户 userId && e.sfksc === "1" && hasAuth("ly-sm-bpm-expansion_formdelete")
 *
 *   路由（umi 运行时）：  /process/apply/:processId/:docUnid?      ← docUnid 可选
 *   页面（p__process__apply__index.js）：
 *     docUnid = match.params.docUnid || generateUUID()
 *     toProcessPage(processId, docUnid) 内部被 `docUnid &&` 守卫
 *
 *   ⇒ 把 lcsqid 置为空串，pathname 变成 "/process/apply/{lcid}/"，
 *     :docUnid? 匹配到空串 → 前端生成全新 UUID → 走"发起新申请"分支，
 *     既不会请求一个不存在的 lcsqid，也不需要伪造任何一条已有申请。
 * ---------------------------------------------------------------------------
 */

(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* 0. 参数与默认值                                                      */
  /* ------------------------------------------------------------------ */

  var ARG = (typeof $argument === "undefined" || $argument === null) ? {} : $argument;

  // 全部默认值取自本次抓包（HAR entry #10 getProcessFormParams / #22 #23 列表）
  var DEFAULTS = {
    lcid: "61c48fff-73b8-47d7-b3ca-01ace5fd9a5b", // 学生请假申请 流程定义 ID
    title: "学生请假申请",                        // 卡片标题 (lcmc)
    timeText: "未发起",                           // "申请时间：" 后的文字 (sqsj)
    nodeText: "点击本行开始填写"                  // "当前节点：" 后的文字 (dqjd)
  };

  function argStr(name) {
    var v = ARG[name];
    if (v === undefined || v === null) return DEFAULTS[name];
    return String(v);
  }

  var DEBUG = ARG.debug === true;

  function log(obj) {
    if (DEBUG) console.log(obj);
  }

  // $done 只能调用一次
  var finished = false;
  function passThrough() {
    if (finished) return;
    finished = true;
    $done({});
  }
  function replaceBody(str) {
    if (finished) return;
    finished = true;
    $done({ body: str });
  }

  /* ------------------------------------------------------------------ */
  /* 1. 守卫                                                              */
  /* ------------------------------------------------------------------ */

  try {
    if (ARG.enabled === false) {
      passThrough();
      return;
    }

    var url = ($request && $request.url) || "";

    // 双保险：[Script] 规则已做 URL Guard，这里用同一套锚定正则再挡一次。
    // 注意不能用 indexOf 之类的子串判断 —— "…queryBpmApplyedProcessFake"
    // 这类路径会把它一起放行。
    if (!/^https:\/\/ydxy\.gzpt\.edu\.cn:6870\/ydxg\/api\/sm-mobile\/processCenter\/queryBpmApplyedProcess(?:[?#]|$)/.test(url)) {
      log({ stage: "skip", why: "url guard" });
      passThrough();
      return;
    }
    if (!$response || $response.status !== 200) {
      log({ stage: "skip", why: "status=" + ($response && $response.status) });
      passThrough();
      return;
    }

    function q(name) {
      var m = url.match(new RegExp("[?&]" + name + "=([^&#]*)"));
      return m ? decodeURIComponent(m[1]) : null;
    }

    // 前端是累加拼接 list，只在第一页注入，避免翻页后出现两条
    var pageNum = q("pageNum");
    if (pageNum !== null && pageNum !== "" && pageNum !== "1") {
      log({ stage: "skip", why: "pageNum=" + pageNum });
      passThrough();
      return;
    }

    // 处于搜索态时不注入，避免污染搜索结果
    var keyword = q("keyword");
    if (keyword) {
      log({ stage: "skip", why: "keyword=" + keyword });
      passThrough();
      return;
    }

    /* ---------------------------------------------------------------- */
    /* 2. 解析                                                            */
    /* ---------------------------------------------------------------- */

    var raw = $response.body;
    if (raw instanceof Uint8Array) {
      raw = String.fromCharCode.apply(null, raw);
    }
    if (typeof raw !== "string" || raw.length === 0) {
      log({ stage: "skip", why: "empty body" });
      passThrough();
      return;
    }

    var json;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      log({ stage: "skip", why: "body not JSON" });
      passThrough();
      return;
    }

    if (!json || json.code !== 200 || !json.data || !Array.isArray(json.data.list)) {
      log({ stage: "skip", why: "unexpected response shape" });
      passThrough();
      return;
    }

    /* ---------------------------------------------------------------- */
    /* 3. 构造并注入                                                       */
    /* ---------------------------------------------------------------- */

    var row = {
      // 卡片正文两行
      sqsj: argStr("timeText"),
      dqjd: argStr("nodeText"),
      lcmc: argStr("title"),
      // 路由：lcsqid 留空 ⇒ /process/apply/{lcid}/ ⇒ 前端生成新 UUID ⇒ 新建态
      lcid: argStr("lcid") || DEFAULTS.lcid,
      lcsqid: "",
      // 走 <Link> 分支，而不是 bdsjfsdm==="02" 的 restful BPM 跳转分支
      bdsjfsdm: "01",
      // 阻断"删除"按钮
      sqrbh: "",
      sfksc: "0"
    };

    var list = json.data.list;

    // 幂等：同一响应里已存在同 lcid 且无 lcsqid 的行就不再插
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (it && typeof it === "object" && it.lcid === row.lcid && !it.lcsqid) {
        log({ stage: "skip", why: "already injected" });
        passThrough();
        return;
      }
    }

    var before = list.length;
    list.unshift(row);

    // 页脚文案判断用的是 total：0 会显示"没有查找到流程数据"，+1 后显示"到底了..."
    if (typeof json.data.total === "number" && isFinite(json.data.total)) {
      json.data.total += 1;
    } else {
      json.data.total = list.length;
    }

    log({
      stage: "inject",
      lcid: row.lcid,
      title: row.lcmc,
      listBefore: before,
      listAfter: list.length,
      total: json.data.total,
      pageCount: json.data.pageCount,
      // hasMore 由前端用 pageCount > pageNum 计算，未改动
      newBytes: JSON.stringify(json).length
    });

    replaceBody(JSON.stringify(json));

  } catch (e) {
    // 任何异常都原样放行，绝不把用户的页面搞挂
    log({ stage: "error", error: String(e) });
    passThrough();
  }
})();
