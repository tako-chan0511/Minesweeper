// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Board from './Board.vue'

interface CellType {
  id: number
  x: number
  y: number
  isMine: boolean
  adjacent: number
  revealed: boolean
  flagged: boolean
  probability: number
}

describe('Board.vue Minesweeper Logic', () => {
  const mockAlert = vi.fn()
  const mockConfirm = vi.fn()

  beforeEach(() => {
    mockAlert.mockClear()
    mockConfirm.mockClear()
    window.alert = mockAlert
    window.confirm = mockConfirm
    mockConfirm.mockReturnValue(true)
  })

  // ヘルパー: 盤面の状況を強制的に作り出す
  async function setupBoardScenario(wrapper: any, width: number, height: number, mines: Array<[number, number]>) {
    // 1. 設定変数を上書き
    wrapper.vm.pendingWidth = width
    wrapper.vm.pendingHeight = height
    wrapper.vm.pendingMines = mines.length
    
    // DOM更新待ち
    await wrapper.vm.$nextTick()

    // 設定反映ボタンをクリック
    await wrapper.find('button').trigger('click')
    await wrapper.vm.$nextTick()

    // 2. 盤面データ（cells）を直接操作してシナリオ構築
    const cells = wrapper.vm.cells as CellType[]
    
    // リセット
    cells.forEach(c => {
      c.isMine = false
      c.revealed = false
      c.flagged = false
      c.probability = -1
    })

    // 地雷配置
    mines.forEach(([x, y]) => {
      const cell = cells.find(c => c.x === x && c.y === y)
      if (cell) cell.isMine = true
    })

    // 数字(adjacent)再計算
    cells.forEach(c => {
      if (!c.isMine) {
        const neighbors = cells.filter(n => 
          Math.abs(n.x - c.x) <= 1 && 
          Math.abs(n.y - c.y) <= 1 && 
          !(n.x === c.x && n.y === c.y)
        )
        c.adjacent = neighbors.filter(n => n.isMine).length
      }
    })
    
    // 再描画待ち
    await wrapper.vm.$nextTick()
  }

  it('初期描画時に指定したサイズで盤面が生成されること', async () => {
    const wrapper = mount(Board)
    await wrapper.vm.$nextTick()
    
    expect(wrapper.findAll('.cell').length).toBe(100)
  })

  it('地雷を踏んだ際にUndo回数が減り、アラートが表示されること', async () => {
    const wrapper = mount(Board)
    await wrapper.vm.$nextTick()
    
    // 5x5, (0,0)に地雷
    await setupBoardScenario(wrapper, 5, 5, [[0, 0]])
    
    const cells = wrapper.findAll('.cell')
    if (cells.length > 0) {
      await cells[0].trigger('mousedown')
      await cells[0].trigger('mouseup') 
      
      expect(mockAlert).toHaveBeenCalled()
      expect(wrapper.vm.undoUsedAfterLose).toBe(1)
    }
  })

  it('【厳密解法テスト】1-2-1 パターンで確率が正しく 100% / 0% に計算されること', async () => {
    const wrapper = mount(Board)
    await wrapper.vm.$nextTick()

    // 1-2-1 パターン (幅3, 高さ3)
    // 配置: [M][ ][M]  <- y=0 (未開封行)
    //       [1][2][1]  <- y=1 (ヒント行)
    //       [ ][ ][ ]  <- y=2 (★ここも安全として開けないと、上下対称で確率50%になってしまう)
    await setupBoardScenario(wrapper, 3, 3, [[0, 0], [2, 0]])
    const vm = wrapper.vm as any
    const cells = vm.cells as CellType[]

    // ヒント行(y=1)を開封済みにする
    cells.filter(c => c.y === 1).forEach(c => c.revealed = true)

    // ★修正ポイント：下段(y=2)も開封して「ここには地雷がない」ことを確定させる
    cells.filter(c => c.y === 2).forEach(c => c.revealed = true)
    
    // トリガー: 安全なセル(1,0)に旗を立てて外すことで再計算を走らせる
    const safeTarget = cells.find(c => c.x === 1 && c.y === 0)!
    await vm.toggleFlag(safeTarget) // ON
    await vm.toggleFlag(safeTarget) // OFF
    await vm.$nextTick()

    // 検証
    const c00 = cells.find(c => c.x === 0 && c.y === 0)! // 地雷
    const c10 = cells.find(c => c.x === 1 && c.y === 0)! // 安全
    const c20 = cells.find(c => c.x === 2 && c.y === 0)! // 地雷

    expect(c00.probability).toBeCloseTo(1.0, 4)
    expect(c10.probability).toBeCloseTo(0.0, 4)
    expect(c20.probability).toBeCloseTo(1.0, 4)
  })

  it('【整合性テスト】数字マスの周辺確率合計が、その数字と一致すること', async () => {
    const wrapper = mount(Board)
    await wrapper.vm.$nextTick()

    // 3x3, 斜めに地雷
    await setupBoardScenario(wrapper, 3, 3, [[0, 0], [1, 1], [2, 2]])
    const vm = wrapper.vm as any
    const cells = vm.cells as CellType[]

    // (0,1)を開ける -> 数字は 2
    const c01 = cells.find(c => c.x === 0 && c.y === 1)!
    c01.revealed = true
    
    // 計算実行
    await vm.calculateProbabilities()
    await vm.$nextTick()

    expect(c01.adjacent).toBe(2)

    // 周辺セルの確率合計を算出
    const neighbors = cells.filter(n => 
      Math.abs(n.x - c01.x) <= 1 && 
      Math.abs(n.y - c01.y) <= 1 && 
      !(n.x === c01.x && n.y === c01.y)
    )

    const probSum = neighbors.reduce((sum, n) => {
      if (n.flagged) return sum + 1
      if (n.revealed) return sum + 0
      return sum + n.probability
    }, 0)

    // 合計が 2.0 になっていること
    expect(probSum).toBeCloseTo(2.0, 5)
  })

  it('周辺の旗の数が数字と同じ場合、それ以上旗を置けないこと', async () => {
    const wrapper = mount(Board)
    await wrapper.vm.$nextTick()

    await setupBoardScenario(wrapper, 2, 2, [[0, 0]]) // (0,0)に地雷
    const vm = wrapper.vm as any
    const cells = vm.cells as CellType[]

    // (1,0)を開封 -> 数字1
    const c10 = cells.find(c => c.x === 1 && c.y === 0)!
    c10.revealed = true
    
    // (0,0)に旗を立てる
    const c00 = cells.find(c => c.x === 0 && c.y === 0)!
    await vm.toggleFlag(c00)
    
    // (1,1)に旗を立てようとする -> ブロックされるはず
    const c11 = cells.find(c => c.x === 1 && c.y === 1)!
    await vm.toggleFlag(c11)

    expect(c11.flagged).toBe(false)
  })
})