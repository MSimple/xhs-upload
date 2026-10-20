import type { Photo } from "./types";

export const SHOT_CATEGORIES = [
  "门店探店",
  "外观质感",
  "内饰空间",
  "家庭出行",
  "试驾智驾",
  "补能充电",
  "生活方式",
  "细节特写",
  "夜间氛围",
  "视频素材",
] as const;

export const CATEGORY_HINTS: Record<string, string> = {
  门店探店: "门头、展厅、交付区、儿童区、咖啡区",
  外观质感: "车头、侧面、车尾、轮毂、天幕",
  内饰空间: "双联屏、二排、冰箱、座椅、后备箱",
  家庭出行: "儿童座椅、婴儿车、接娃、宠物、全家",
  试驾智驾: "第一视角、HUD、辅助驾驶、试驾路线",
  补能充电: "超充站、充电枪、进度界面、夜间充电",
  生活方式: "露营、郊游、通勤、搬家、野餐",
  细节特写: "星环灯、缝线、音响罩、门把手、材质",
  夜间氛围: "城市夜景、地下车库、门店夜景、尾灯",
  视频素材: "开门上车、后备箱、座椅放倒、探店 walkthrough",
};

const CAR_KEYWORDS = [
  "车",
  "汽车",
  "suv",
  "mpv",
  "理想",
  "试驾",
  "门店",
  "展厅",
  "后备箱",
  "座椅",
  "方向盘",
  "充电",
  "驾驶",
  "自驾",
];

const KEYWORDS: Record<string, string[]> = {
  门店探店: ["门店", "展厅", "零售中心", "交付", "看车", "理想汽车", "销售", "试驾牌"],
  外观质感: ["车身", "车头", "车尾", "外观", "轮毂", "星环灯", "尾灯", "前脸", "腰线"],
  内饰空间: ["内饰", "中控", "座椅", "后排", "方向盘", "冰箱", "天幕", "杯架", "二排"],
  家庭出行: ["孩子", "儿童", "家庭", "婴儿", "亲子", "后备箱", "宠物", "家人", "接娃"],
  试驾智驾: ["试驾", "辅助驾驶", "NOA", "HUD", "导航", "试驾路线", "仪表"],
  补能充电: ["充电", "超充", "补能", "充电桩", "充电枪"],
  生活方式: ["露营", "郊游", "旅行", "通勤", "野餐", "搬家", "公园", "自驾"],
  细节特写: ["特写", "缝线", "音响", "门把手", "材质", "按键", "微距"],
  夜间氛围: ["夜景", "夜间", "蓝调", "车库", "夜拍", "尾灯"],
  视频素材: ["视频", "动态", "第一视角", "vlog", "运镜"],
};

type Place = "store" | "outdoor" | "night" | "charge" | "road" | "home";

interface CuratedShot {
  category: string;
  title: string;
  subject: string;
  composition: string;
  lighting: string;
  props: string;
  caption: string;
  place: Place;
  priority: number;
}

export interface ShotIdeaDraft {
  category: string;
  title: string;
  location: string;
  subject: string;
  composition: string;
  lighting: string;
  props: string;
  caption: string;
  priority: number;
}

function shot(
  category: string,
  title: string,
  subject: string,
  composition: string,
  lighting: string,
  props: string,
  caption: string,
  place: Place,
  priority = 2
): CuratedShot {
  return {
    category,
    title,
    subject,
    composition,
    lighting,
    props,
    caption,
    place,
    priority,
  };
}

const SHOT_BANK: CuratedShot[] = [
  shot(
    "门店探店",
    "门头 + 星环灯 + 人",
    "站在门店招牌侧前方，让车头星环灯和门头同时入镜，人只占右下角",
    "24mm 低角度，门头占上三分之一，人不要挡住车标",
    "傍晚蓝调或上午顺光，避免玻璃反光",
    "咖啡杯、帆布袋",
    "周末为什么来理想门店坐了一下午",
    "store",
    1
  ),
  shot(
    "门店探店",
    "展车 45° + 销售讲解",
    "从展厅侧后方拍展车 45°，销售在车旁讲解，人物虚化",
    "35mm，车身占画面三分之二，留出一点展厅环境",
    "展厅顶光，镜头稍微抬高避开地面反光",
    "试驾牌、配置单",
    "第一次认真看理想，我先问了自己三个问题",
    "store",
    1
  ),
  shot(
    "门店探店",
    "交付区与儿童区",
    "交付花束、儿童区积木、家长蹲下陪孩子",
    "50mm 抓拍，前景用花束或玩偶做虚化",
    "室内暖光，尽量不打扰其他客人",
    "花束、玩偶、气球",
    "带娃看车，结果他在儿童区不肯走",
    "store",
    2
  ),
  shot(
    "门店探店",
    "门店咖啡与休息区",
    "咖啡杯放桌面，窗外或远处展车虚化",
    "从桌面平视，杯子和展车形成前后景",
    "下午侧光，杯口有一点高光",
    "咖啡、书、帆布袋",
    "看车顺便喝了杯咖啡，理想门店比我想的好待",
    "store",
    2
  ),
  shot(
    "门店探店",
    "售后接待与休息区",
    "服务顾问在接待台讲解，休息区沙发和饮品入镜",
    "35mm，从侧面拍，保留服务流程的细节",
    "室内自然光，避免拍到其他车主信息",
    "保养单、饮品",
    "第一次进理想售后，记录一下真实流程",
    "store",
    3
  ),
  shot(
    "外观质感",
    "车头 45° 低机位",
    "车头 45° 低机位，星环灯点亮，背景干净",
    "24mm 贴地拍，车头占画面下半部，天空留白",
    "日落前后或蓝调，车灯点亮更有辨识度",
    "无",
    "理想的前脸，实车比照片更有存在感",
    "store",
    1
  ),
  shot(
    "外观质感",
    "侧面腰线与轮毂",
    "贴着车身拍侧面腰线和轮毂，人在车后虚化",
    "低角度 35mm，车身从画面左下延伸到右上",
    "侧逆光，让腰线有一道亮边",
    "无",
    "绕车一圈，最容易忽略的是侧面这条线",
    "outdoor",
    2
  ),
  shot(
    "外观质感",
    "车尾贯穿尾灯",
    "正后方略低角度，贯穿尾灯点亮，地面有一点反光",
    "35mm，车尾占画面三分之二，左右对称",
    "夜间或地下车库，关掉周围杂光",
    "无",
    "晚上锁车后，还是会回头看一眼",
    "night",
    1
  ),
  shot(
    "外观质感",
    "轮毂与卡钳特写",
    "轮毂和卡钳占满画面，车身只留一条边",
    "50mm 低角度，轮毂居中，注意轮胎干净",
    "阴天或车库柔光，避免轮毂高光过曝",
    "无",
    "细节控会盯着轮毂看很久",
    "store",
    3
  ),
  shot(
    "外观质感",
    "全景天幕与天空",
    "从后排仰拍天幕，树叶或天空倒映在玻璃上",
    "24mm 仰拍，天幕占画面大部分，座椅边缘做前景",
    "晴天上午或傍晚，天空有层次",
    "无",
    "躺在车里看天空，是这次看车最意外的收获",
    "outdoor",
    2
  ),
  shot(
    "内饰空间",
    "前排双联屏与手部操作",
    "从副驾拍方向盘和双联屏，手正在操作屏幕",
    "35mm，屏幕和方向盘形成对角线，人物只露手",
    "车内柔光或阴天，避免屏幕反光",
    "手机、咖啡杯",
    "这块屏到底好不好用，我试了三个功能",
    "store",
    1
  ),
  shot(
    "内饰空间",
    "二排腿部空间",
    "从后排拍前排，腿自然摆放，展示真实腿部空间",
    "24mm，镜头略低，前排座椅和后排腿部同时入镜",
    "侧窗自然光，座椅纹理清晰",
    "毯子、拖鞋",
    "二排能跷二郎腿吗？实测给你看",
    "store",
    1
  ),
  shot(
    "内饰空间",
    "冰箱、杯架与储物",
    "打开冰箱放饮料，杯架和储物格一起入镜",
    "50mm 俯拍，冰箱门半开，饮料颜色有对比",
    "车内光或补一盏小灯，避免冰箱内部过暗",
    "饮料、水果、湿巾",
    "冰箱不是噱头，夏天真的会用",
    "store",
    2
  ),
  shot(
    "内饰空间",
    "座椅放倒与零重力",
    "座椅放倒、脚托升起，毯子盖到膝盖",
    "侧后方 35mm，拍出座椅角度和腿部支撑",
    "柔光，避免顶灯直射",
    "毯子、眼罩、抱枕",
    "午休在车里躺了 20 分钟，差点睡着",
    "store",
    2
  ),
  shot(
    "内饰空间",
    "后备箱装载能力",
    "尾门打开，婴儿车、行李箱或露营箱依次放入",
    "24mm 广角，从车尾正后方拍，地面留一点空间",
    "白天自然光，后备箱内部补一点光",
    "婴儿车、行李箱、露营箱",
    "后备箱能不能装，拿婴儿车试一下",
    "outdoor",
    1
  ),
  shot(
    "家庭出行",
    "儿童座椅安装",
    "后排儿童座椅 + 孩子背影，家长在旁扣安全带",
    "35mm，从侧后方拍，孩子不露正脸",
    "侧窗自然光，车内不要太暗",
    "儿童座椅、玩偶、妈妈包",
    "有孩子之后，选车先看后排",
    "outdoor",
    1
  ),
  shot(
    "家庭出行",
    "婴儿车进后备箱",
    "尾门半开，婴儿车推进后备箱，妈妈在旁边扶",
    "24mm 低角度，拍清后备箱开口和婴儿车尺寸",
    "白天，避免逆光",
    "婴儿车、妈妈包、购物袋",
    "婴儿车不用折叠也能放？现场试给你看",
    "outdoor",
    1
  ),
  shot(
    "家庭出行",
    "接娃放学",
    "校门口远景，孩子背着书包走向车，家长在车门旁",
    "50mm 抓拍，车和校门口环境同时入镜",
    "傍晚，注意保护其他孩子隐私",
    "书包、水杯",
    "接娃这件小事，车好不好用一眼就知道",
    "road",
    2
  ),
  shot(
    "家庭出行",
    "全家出行后排",
    "从副驾向后拍，后排家人手部、窗外风景",
    "35mm，前排座椅做前景，后排人物虚化",
    "逆光或侧逆光，窗景有层次",
    "零食、水杯、毯子",
    "一家人出门，后排才是主战场",
    "road",
    2
  ),
  shot(
    "家庭出行",
    "宠物出行",
    "宠物在后备箱或后排，安全网和宠物垫入镜",
    "35mm，从车尾或侧门拍，宠物看向窗外",
    "自然光，避免闪光灯吓到宠物",
    "宠物垫、安全网、水碗",
    "带狗出门，终于不用它挤在我腿上了",
    "outdoor",
    3
  ),
  shot(
    "试驾智驾",
    "驾驶位第一视角",
    "方向盘、仪表和前方道路同时入镜",
    "24mm 固定机位，镜头略高于方向盘",
    "白天，注意不要在行驶中操作手机",
    "无",
    "试驾第一视角，先看视野和坐姿",
    "road",
    1
  ),
  shot(
    "试驾智驾",
    "辅助驾驶界面",
    "停车状态下拍中控导航或辅助驾驶界面",
    "35mm，屏幕居中，手指指向关键信息",
    "车内柔光，避免屏幕反光",
    "无",
    "辅助驾驶界面到底怎么看，一条视频讲清楚",
    "road",
    2
  ),
  shot(
    "试驾智驾",
    "试驾路线动态",
    "车在城市道路或高速上行驶，副驾拍摄",
    "50mm，车身占画面一半，保留道路环境",
    "侧逆光或傍晚，车身有轮廓光",
    "无",
    "这段试驾路线，把城市和高速都跑了",
    "road",
    2
  ),
  shot(
    "试驾智驾",
    "销售讲解与试驾准备",
    "试驾前销售在车旁讲解，手部指向车门或屏幕",
    "35mm 抓拍，人物和车各占一半",
    "自然光，避免背光",
    "试驾牌、钥匙",
    "第一次试驾理想，销售先讲了这几点",
    "store",
    3
  ),
  shot(
    "试驾智驾",
    "HUD 与仪表",
    "从驾驶位拍 HUD 投影和仪表信息",
    "35mm，镜头贴近驾驶员视线，HUD 清晰",
    "白天强光下拍，更能看出可读性",
    "无",
    "HUD 好不好用，要看强光下清不清楚",
    "road",
    2
  ),
  shot(
    "补能充电",
    "超充站车与桩",
    "车停在充电桩旁，充电枪连接，站牌入镜",
    "24mm 低角度，车和桩形成对角线",
    "傍晚蓝调，站牌灯和车灯都亮起",
    "充电枪",
    "第一次来理想超充站，流程比想象简单",
    "charge",
    1
  ),
  shot(
    "补能充电",
    "充电枪插入特写",
    "手部握住充电枪插入充电口，充电口指示灯亮",
    "50mm 特写，手和充电口占画面中心",
    "白天或充电站顶光，避免手部阴影",
    "充电枪",
    "充电枪好不好拔，女生也能单手操作",
    "charge",
    2
  ),
  shot(
    "补能充电",
    "充电进度界面",
    "中控屏或手机 App 的充电进度、剩余时间",
    "50mm 俯拍，屏幕占画面大部分",
    "车内柔光，屏幕亮度调高",
    "手机",
    "充了 10 分钟，续航涨了多少",
    "charge",
    1
  ),
  shot(
    "补能充电",
    "夜间充电",
    "夜间充电站，车灯、桩灯和地面反光",
    "24mm，车头和充电桩同框，利用地面倒影",
    "夜间，关掉周围杂光",
    "无",
    "晚上来充电，顺便在车里看了会剧",
    "charge",
    3
  ),
  shot(
    "生活方式",
    "后备箱露营模式",
    "后备箱打开，露营椅、天幕和折叠桌摆好",
    "24mm 从车尾拍，车尾灯和露营灯同时入镜",
    "日落前后，天幕透光",
    "露营椅、天幕、折叠桌、露营灯",
    "后备箱打开就是露营模式",
    "outdoor",
    1
  ),
  shot(
    "生活方式",
    "郊外停车远景",
    "车停在山野、湖边或草地的远景，人站在车旁",
    "35mm，车占画面三分之一，环境占三分之二",
    "清晨或傍晚，天空有颜色",
    "野餐垫、外套",
    "周末把车开到郊外，什么都不做",
    "outdoor",
    1
  ),
  shot(
    "生活方式",
    "城市通勤车内视角",
    "早晚高峰车流，从车内看窗外，咖啡杯入镜",
    "35mm，从副驾拍驾驶位侧脸或手部",
    "清晨或傍晚，车窗有城市灯光",
    "咖啡、通勤包",
    "每天通勤 40 分钟，车内是我最安静的时间",
    "road",
    2
  ),
  shot(
    "生活方式",
    "搬家与大件装载",
    "后备箱装大件纸箱，尾门半开，人正在搬",
    "24mm，从侧后方拍，纸箱和后备箱开口同框",
    "白天自然光",
    "纸箱、胶带、推车",
    "搬家没叫货拉拉，后备箱跑了两趟",
    "home",
    3
  ),
  shot(
    "生活方式",
    "亲子野餐",
    "车旁铺野餐垫，孩子或宠物在垫子上",
    "35mm，车做背景，人物在画面下方",
    "下午侧光，草地颜色饱满",
    "野餐篮、气球、宠物绳",
    "有车之后，周末的范围变大了一点",
    "outdoor",
    2
  ),
  shot(
    "细节特写",
    "星环灯局部",
    "只拍星环灯灯带局部，背景全黑",
    "85mm 长焦，灯带从画面一侧延伸到另一侧",
    "夜间，关掉其他光源",
    "无",
    "理想最好认的，是这条灯",
    "night",
    1
  ),
  shot(
    "细节特写",
    "内饰缝线与音响罩",
    "座椅缝线、门板音响罩的微距细节",
    "90mm 微距，浅景深，焦点落在缝线",
    "柔光，避免硬阴影",
    "无",
    "内饰质感，要看这些不起眼的地方",
    "store",
    2
  ),
  shot(
    "细节特写",
    "门把手与电吸门",
    "手部拉动门把手，车门自动吸合",
    "50mm，手和门把手特写，车门边缘入镜",
    "自然光或展厅柔光",
    "无",
    "电吸门这个细节，用一次就回不去",
    "store",
    2
  ),
  shot(
    "细节特写",
    "屏幕与实体按键",
    "手指按屏幕或实体按键，界面有反馈",
    "50mm 特写，手指和屏幕占画面中心",
    "车内柔光，屏幕亮度适中",
    "无",
    "实体按键和屏幕，你更喜欢哪个",
    "store",
    3
  ),
  shot(
    "细节特写",
    "座椅材质",
    "座椅皮质、打孔和缝线的微距",
    "90mm 微距，侧光突出纹理",
    "侧光，避免直射",
    "无",
    "座椅摸起来怎么样，镜头比文字更直观",
    "store",
    2
  ),
  shot(
    "夜间氛围",
    "城市夜景与车",
    "车停在城市夜景前，车灯和远处灯光呼应",
    "24mm 长曝光，车占画面三分之一",
    "蓝调时刻，使用三脚架",
    "三脚架",
    "晚上的城市，和理想一起更好看",
    "night",
    1
  ),
  shot(
    "夜间氛围",
    "地下车库电影感",
    "车头灯照亮水泥柱，车身在暗处",
    "24mm 低角度，车灯和柱子形成光束",
    "夜间车库，关闭车库大灯",
    "无",
    "地下车库也能拍出电影感",
    "night",
    2
  ),
  shot(
    "夜间氛围",
    "门店夜景",
    "玻璃幕墙、展车和门店灯光同框",
    "24mm，从街对面拍，利用玻璃倒影",
    "夜间，等店内灯光稳定",
    "无",
    "晚上路过理想门店，还是想进去看看",
    "night",
    2
  ),
  shot(
    "夜间氛围",
    "尾灯收尾",
    "贯穿尾灯点亮，车尾占画面大部分",
    "50mm，正后方略低，尾灯水平居中",
    "夜间，地面有一点反光",
    "无",
    "锁车后的尾灯，是我最喜欢的收尾",
    "night",
    1
  ),
  shot(
    "视频素材",
    "开门上车第一视角",
    "从车外拉开车门，镜头推进到车内",
    "24mm 手持，动作放慢，保持稳定",
    "白天或展厅光",
    "无",
    "第一视角上车，带你看看理想内饰",
    "store",
    1
  ),
  shot(
    "视频素材",
    "后备箱开合",
    "双手拎东西，用脚踢或按键打开后备箱",
    "35mm 固定机位，拍到脚部动作和尾门开合",
    "白天自然光",
    "购物袋、纸箱",
    "双手拎满东西，怎么开后备箱",
    "outdoor",
    2
  ),
  shot(
    "视频素材",
    "座椅放倒一镜到底",
    "从正常坐姿到座椅放倒、脚托升起，一镜到底",
    "24mm，从侧后方固定拍摄",
    "车内柔光",
    "毯子、抱枕",
    "一键放倒，车内秒变午休房",
    "store",
    2
  ),
  shot(
    "视频素材",
    "探店 walkthrough",
    "从门头走到展车，再拉开车门看内饰",
    "24mm 稳定器，匀速前进，不要频繁变向",
    "自然光，避开人流高峰",
    "无",
    "跟我逛一圈理想门店",
    "store",
    1
  ),
  shot(
    "视频素材",
    "试驾第一视角",
    "驾驶位固定机位，记录起步、转弯和停车",
    "24mm，手机固定，注意安全路段",
    "白天，画面不要过曝",
    "无",
    "试驾第一视角，安静得有点意外",
    "road",
    2
  ),
];

function placeLocation(place: Place, city: string): string {
  const prefix = city ? `${city} ` : "";
  if (place === "store") return `${prefix}理想汽车零售中心/展厅`;
  if (place === "outdoor") return `${prefix}周边公园/露营地/郊外`;
  if (place === "night") return `${prefix}城市夜景/地下车库`;
  if (place === "charge") return `${prefix}理想超充站/商场充电区`;
  if (place === "road") return `${prefix}城市道路/试驾路线`;
  return `${prefix}小区/地库/家门口`;
}

export function isShotCategory(value: string): boolean {
  return (SHOT_CATEGORIES as readonly string[]).includes(value);
}

export function analyzeShotCoverage(images: Photo[]) {
  return SHOT_CATEGORIES.map((category) => {
    const keywords = KEYWORDS[category] || [];
    let count = 0;
    for (const image of images) {
      const text = [
        image.summary || "",
        image.scene || "",
        image.mood || "",
        ...(image.tags || []),
        ...(image.analysis?.summary ? [image.analysis.summary] : []),
        ...(image.analysis?.tags || []),
        ...(image.analysis?.topics || []),
        ...(image.analysis?.objects || []),
      ]
        .join(" ")
        .toLowerCase();
      const carRelated = CAR_KEYWORDS.some((keyword) =>
        text.includes(keyword)
      );
      if (
        carRelated &&
        keywords.some((keyword) => text.includes(keyword.toLowerCase()))
      ) {
        count++;
      }
    }
    return {
      category,
      count,
      hint: CATEGORY_HINTS[category],
      missing: count === 0,
    };
  });
}

function normalizeTitle(title: string) {
  return title
    .replace(/[\s，。！？、,.!?：:；;""''（）()\-—·]/g, "")
    .toLowerCase();
}

export function pickCuratedShotIdeas(options: {
  count: number;
  category?: string;
  city?: string;
  existingTitles?: string[];
}): ShotIdeaDraft[] {
  const count = Math.max(1, Math.min(12, options.count || 8));
  const existing = new Set(
    (options.existingTitles || []).map(normalizeTitle).filter(Boolean)
  );
  let pool = SHOT_BANK.filter(
    (idea) => !existing.has(normalizeTitle(idea.title))
  );
  if (options.category && isShotCategory(options.category)) {
    pool = pool.filter((idea) => idea.category === options.category);
  }

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const picked: CuratedShot[] = [];
  const usedCategories = new Set<string>();

  for (const idea of shuffled) {
    if (picked.length >= count) break;
    if (usedCategories.has(idea.category)) continue;
    picked.push(idea);
    usedCategories.add(idea.category);
  }
  for (const idea of shuffled) {
    if (picked.length >= count) break;
    if (picked.includes(idea)) continue;
    picked.push(idea);
  }

  return picked.slice(0, count).map((idea) => ({
    category: idea.category,
    title: idea.title,
    location: placeLocation(idea.place, options.city || ""),
    subject: idea.subject,
    composition: idea.composition,
    lighting: idea.lighting,
    props: idea.props,
    caption: idea.caption,
    priority: idea.priority,
  }));
}
