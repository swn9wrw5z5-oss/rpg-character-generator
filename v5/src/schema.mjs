// Fields ending in :n are finite numbers; :b are Excel 0/1 flags.
export const schemas = {
  families: ['族系', 'id=族系ID name=族系名稱'],
  species: ['種族設定', 'id=種族ID familyId=族系ID name=種族名稱 bodyId=預設身體ID skeletonId=骨架ID status=設定狀態 minWidth:n=最小寬 maxWidth:n=最大寬 minHeight:n=最小高 maxHeight:n=最大高 weight:n=種族出現權重 enabled:b=啟用'],
  abilities: ['基礎能力', 'id=能力ID name=名稱 baseline:n=初始基準值 perPoint:n=每分提升量 min:n=最小值 max:n=最大值 zero:n=初始計分零點 enabled:b=啟用 status=狀態／說明'],
  rarities: ['稀有度', 'id=稀有度ID name=名稱 min:n=總分下限 max:n=總分上限 enabled:b=啟用 status=設定狀態'],
  personalities: ['個性', 'id=個性ID name=個性名稱 visible:b=展示給玩家 weight:n=抽取權重 effectId=玩法效果ID notes=備註'],
  options: ['外觀選項', 'id=外觀ID category=類別 name=顯示名稱 value=色碼／素材ID weight:n=權重 enabled:b=啟用 families=適用族系 notes=備註'],
  assets: ['美術素材庫', 'id=素材ID type=素材類型 familyId=所屬族系 speciesId=對應種族ID skeletonId=骨架ID path=檔案相對路徑 status=狀態'],
  skeletons: ['動畫骨架', 'id=骨架ID name=名稱 status=狀態'],
  visuals: ['外觀生成規則', 'id=規則ID familyId=族系ID speciesId=種族ID skeletonId=骨架ID hair=可用髮型 hairColor=髮色 skinColor=膚色 eyes=眼睛 enabled:b=啟用 notes=備註'],
  skills: ['技能效果索引', 'id=技能ID name=技能名稱 effect=遊戲實際效果 status=設定狀態 enabled:b=可供生成 cost:n=生成取得成本分 bindingType=綁定類型 castHP:n=施放HP castMP:n=施放MP itemId=施放物品ID itemCount:n=物品數量 consumption=消耗組合 costStatus=成本狀態'],
  talents: ['先天天賦與綁定', 'id=天賦ID name=天賦名稱 skillId=對應技能ID owner=綁定歸屬 targetType=綁定目標類型 exampleTargetId=目標ID範例 enabled:b=啟用 weight:n=抽取權重 status=狀態 notes=備註 cost:n=生成成本分'],
  parameters: ['計分參數', 'id=參數 value=數值 status=狀態／說明'],
  growth: ['成長潛力', 'id=評級 HP:n=HP每級成長 MP:n=MP每級成長 HP_REGEN:n=HP回復每級成長 MP_REGEN:n=MP回復每級成長 cost:n=隱藏成本分 status=狀態'],
};
export const ABILITIES = ['HP', 'MP', 'HP_REGEN', 'MP_REGEN'];
export const GRADES = ['D', 'C', 'B', 'A', 'S'];
export const PARAMS = ['頁面最大寬','頁面最大高','每格背包成本','免費背包格數','最低保留能力分','最低保留成長分','天賦預留分','尺寸偏好強度','綁定技能預設成本','背包計分倍率','隱藏每分成長增幅','培養目標等級','成長成本每級倍率'];
export function parameter(data, name) {
  const p = data.parameters.find(p => p.id === name);
  if (!p || typeof p.value !== 'number' || !Number.isFinite(p.value)) throw new Error(`INVALID_PARAMETER: ${name}`);
  return p.value;
}
