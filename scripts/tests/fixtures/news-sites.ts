export type SiteConfig = {
  key: string;
  label: string;
  url: string;
  directUrl: string;
  query: string;
  patterns: RegExp[];
};

export const NEWS_SITES: SiteConfig[] = [
  {
    key: "google_news",
    label: "Google News",
    url: "https://news.google.com/",
    directUrl:
      "https://news.google.com/search?q=%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD&hl=zh-CN&gl=CN&ceid=CN%3Azh-Hans",
    query: "人工智能",
    patterns: [/google\s*news/i, /谷歌新闻/, /news\.google/i],
  },
  {
    key: "bing_news",
    label: "Bing News",
    url: "https://www.bing.com/news",
    directUrl:
      "https://www.bing.com/news/search?q=artificial+intelligence&cc=us&setlang=en-US&FORM=HDRSC6",
    query: "artificial intelligence",
    patterns: [/bing\s*news/i, /必应新闻/, /bing/i],
  },
  {
    key: "bbc_news",
    label: "BBC News",
    url: "https://www.bbc.com/news",
    directUrl: "https://www.bbc.co.uk/search?q=artificial+intelligence&d=NEWS_PS",
    query: "artificial intelligence",
    patterns: [/bbc\s*news/i, /\bbbc\b/i],
  },
  {
    key: "baidu_news",
    label: "百度新闻",
    url: "https://news.baidu.com/",
    directUrl:
      "https://www.baidu.com/s?rtt=1&bsst=1&cl=2&tn=news&rsv_dl=ns_pc&word=%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD",
    query: "人工智能",
    patterns: [/百度新闻/, /baidu\s*news/i, /news\.baidu/i],
  },
];

export const MULTI_NEWS_GOAL = [
  "请访问 Google News、Bing News、BBC News，以及百度新闻，围绕“人工智能”做一份综合新闻分析。",
  "要求：",
  "1. 每个新闻源分别提取 2 到 3 条最值得关注的新闻要点",
  "2. 每个新闻源都要产出一段简短摘要，并明确写出来源站点",
  "3. 最后输出一份综合对比总结，包含共同关注主题、各站点报道重点差异，以及中文和英文新闻源的视角差异",
  "4. 如果适合并行，请自动拆成 DAG 子任务并执行",
  "5. 最终输出 finish，并在 description 中返回完整综合结论",
].join("\n");
