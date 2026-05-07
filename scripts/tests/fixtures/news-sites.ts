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

export const ALIBABA_NEWS_SITES: SiteConfig[] = [
  {
    key: "google_news",
    label: "Google News",
    url: "https://news.google.com/",
    directUrl:
      "https://news.google.com/search?q=Alibaba%20OR%20%E9%98%BF%E9%87%8C%E5%B7%B4%E5%B7%B4&hl=zh-CN&gl=CN&ceid=CN%3Azh-Hans",
    query: "Alibaba OR 阿里巴巴",
    patterns: [/google\s*news/i, /谷歌新闻/, /news\.google/i],
  },
  {
    key: "bing_news",
    label: "Bing News",
    url: "https://www.bing.com/news",
    directUrl:
      "https://www.bing.com/news/search?q=Alibaba+news+BABA&cc=us&setlang=en-US&FORM=HDRSC6",
    query: "Alibaba news BABA",
    patterns: [/bing\s*news/i, /必应新闻/, /bing/i],
  },
  {
    key: "baidu_news",
    label: "百度新闻",
    url: "https://news.baidu.com/",
    directUrl:
      "https://www.baidu.com/s?rtt=1&bsst=1&cl=2&tn=news&rsv_dl=ns_pc&word=%E9%98%BF%E9%87%8C%E5%B7%B4%E5%B7%B4",
    query: "阿里巴巴",
    patterns: [/百度新闻/, /百度搜索/, /baidu\s*news/i, /news\.baidu/i, /baidu/i],
  },
  {
    key: "english_finance_news",
    label: "English Finance News",
    url: "https://www.reuters.com/",
    directUrl: "https://www.reuters.com/site-search/?query=Alibaba",
    query: "Alibaba",
    patterns: [/reuters/i, /cnbc/i, /bloomberg/i, /financial\s*times/i, /finance\s*news/i, /英文财经/],
  },
  {
    key: "chinese_finance_news",
    label: "中文财经媒体",
    url: "https://finance.sina.com.cn/",
    directUrl:
      "https://search.sina.com.cn/?q=%E9%98%BF%E9%87%8C%E5%B7%B4%E5%B7%B4&c=news",
    query: "阿里巴巴",
    patterns: [/新浪财经/, /财新/, /36氪/, /证券时报/, /财经媒体/, /中文财经/],
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

export const ALIBABA_NEWS_GOAL = [
  "请使用蜂群模式，从多个平台采集关于“阿里巴巴 / Alibaba / BABA”的最新新闻，并输出中文综合分析。",
  "必须尽量覆盖这些来源类型：",
  "1. Google News：搜索 Alibaba、BABA、阿里巴巴",
  "2. Bing News：搜索 Alibaba news、BABA",
  "3. 百度新闻或百度搜索新闻结果：搜索 阿里巴巴",
  "4. 英文财经新闻源：例如 Reuters、CNBC、Bloomberg、Financial Times 中可访问的结果",
  "5. 中文财经新闻源：例如 新浪财经、财新、36氪、证券时报中可访问的结果",
  "每个可访问来源请提取 2 到 3 条新闻，并尽量包含：标题、媒体来源、发布时间、链接、简短摘要。",
  "最后请完成去重和主题归类，输出：共同关注主题、中文/英文来源视角差异、对阿里巴巴近期动态的综合判断、以及来源清单。",
  "如果某些来源无法访问，请明确说明失败来源和原因；只要证据足够，请基于已成功来源继续汇总。",
  "如果适合并行，请自动拆成 DAG 子任务并执行。最终输出 finish，并在 description 中返回完整综合结论。",
].join("\n");
