/**
 * 器具顯示輔助（純函式，前端可用）
 *
 * 爐子類是基本配備，標在推薦卡上意義不大（且推薦已依擁有工具過濾，必定已有）。
 * 顯示時濾掉基本爐具，只留值得一提的家電（氣炸鍋、烤箱、電子鍋等）。修 U5。
 */
const BASIC_TOOLS = ["電磁爐", "瓦斯爐", "爐子", "電磁爐/瓦斯爐", "炒鍋", "湯鍋", "平底鍋"];

export function notableTools(tools: string[]): string[] {
  return tools.filter((t) => !BASIC_TOOLS.includes(t));
}
