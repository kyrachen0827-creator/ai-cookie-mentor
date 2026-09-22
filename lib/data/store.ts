/**
 * 料理脈絡資料存取層（介面）
 *
 * 技術選型（Firestore vs Supabase）依 CLAUDE.md 技術棧「擇一，實作時再定」，
 * 目前以介面抽象隔離，Phase 1 先用記憶體實作跑通流程，之後換成正式資料庫
 * 只要提供同一組介面即可，不影響上層 agent 與頁面。
 */
import type {
  CookingSession,
  FoodProfile,
  PortfolioEntry,
  Recipe,
  Score,
} from "./types";

export interface DataStore {
  getFoodProfile(): Promise<FoodProfile | null>;
  saveFoodProfile(profile: FoodProfile): Promise<void>;

  saveRecipe(recipe: Recipe): Promise<void>;
  getRecipe(id: string): Promise<Recipe | null>;

  createSession(session: CookingSession): Promise<void>;
  getSession(id: string): Promise<CookingSession | null>;
  updateSession(session: CookingSession): Promise<void>;

  saveScore(score: Score): Promise<void>;

  addPortfolioEntry(entry: PortfolioEntry): Promise<void>;
  listPortfolio(): Promise<PortfolioEntry[]>;
}

/** Phase 1 暫用：記憶體實作（重啟即清空，僅供開發/Demo 流程跑通） */
class InMemoryStore implements DataStore {
  private foodProfile: FoodProfile | null = null;
  private recipes = new Map<string, Recipe>();
  private sessions = new Map<string, CookingSession>();
  private scores = new Map<string, Score>();
  private portfolio: PortfolioEntry[] = [];

  async getFoodProfile() {
    return this.foodProfile;
  }
  async saveFoodProfile(profile: FoodProfile) {
    this.foodProfile = profile;
  }
  async saveRecipe(recipe: Recipe) {
    this.recipes.set(recipe.id, recipe);
  }
  async getRecipe(id: string) {
    return this.recipes.get(id) ?? null;
  }
  async createSession(session: CookingSession) {
    this.sessions.set(session.id, session);
  }
  async getSession(id: string) {
    return this.sessions.get(id) ?? null;
  }
  async updateSession(session: CookingSession) {
    this.sessions.set(session.id, session);
  }
  async saveScore(score: Score) {
    this.scores.set(score.id, score);
  }
  async addPortfolioEntry(entry: PortfolioEntry) {
    this.portfolio.push(entry);
  }
  async listPortfolio() {
    return this.portfolio;
  }
}

// 單一實例（開發用）。正式版換成 Firestore/Supabase 實作即可。
export const store: DataStore = new InMemoryStore();
