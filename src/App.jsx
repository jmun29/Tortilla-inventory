import { useState, useEffect } from "react";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://jsvfplzcicgvxzttgyze.supabase.co";
const SUPABASE_KEY = "sb_publishable_x8vxogCnT88JaHqKpbie_A_BC95d0Wk";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CATEGORIES = ["All", "Flour", "Corn", "Wheat", "Specialty"];
const TABS = ["Dashboard", "Inventory", "Sales", "Orders"];

export default function TortillaInventory() {
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddSale, setShowAddSale] = useState(false);
  const [showAddOrder, setShowAddOrder] = useState(false);
  const [toast, setToast] = useState(null);
  const [newProduct, setNewProduct] = useState({ name: "", category: "Flour", stock: "", unit: "packs", low_stock_threshold: "", price: "" });
  const [newSale, setNewSale] = useState({ productId: "", qty: "", team: "" });
  const [newOrder, setNewOrder] = useState({ productId: "", qty: "", supplier: "", eta: "" });

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [{ data: p }, { data: s }, { data: o }] = await Promise.all([
        supabase.from("products").select("*").order("name"),
        supabase.from("sales").select("*").order("date", { ascending: false }),
        supabase.from("orders").select("*").order("id", { ascending: false }),
      ]);
      setProducts(p || []);
      setSales(s || []);
      setOrders(o || []);
    } catch (e) {
      showToast("Error loading data. Check your connection.", "error");
    }
    setLoading(false);
  };

  const lowStockItems = products.filter(p => p.stock <= p.low_stock_threshold);
  const totalValue = products.reduce((sum, p) => sum + p.stock * p.price, 0);
  const totalSalesValue = sales.reduce((sum, s) => sum + s.total, 0);
  const filteredProducts = categoryFilter === "All" ? products : products.filter(p => p.category === categoryFilter);

  const handleAddProduct = async () => {
    if (!newProduct.name || !newProduct.stock || !newProduct.price) return showToast("Please fill all fields", "error");
    const row = { name: newProduct.name, category: newProduct.category, stock: +newProduct.stock, unit: newProduct.unit, low_stock_threshold: +newProduct.low_stock_threshold || 20, price: +newProduct.price };
    const { data, error } = await supabase.from("products").insert([row]).select();
    if (error) return showToast("Error adding product", "error");
    setProducts([...products, data[0]]);
    setNewProduct({ name: "", category: "Flour", stock: "", unit: "packs", low_stock_threshold: "", price: "" });
    setShowAddProduct(false);
    showToast("Product added!");
  };

  const handleAddSale = async () => {
    const product = products.find(p => p.id === +newSale.productId);
    if (!product || !newSale.qty || !newSale.team) return showToast("Please fill all fields", "error");
    if (+newSale.qty > product.stock) return showToast("Not enough stock!", "error");
    const saleRow = { product_id: product.id, product_name: product.name, qty: +newSale.qty, total: +(+newSale.qty * product.price).toFixed(2), date: new Date().toISOString().split("T")[0], team: newSale.team };
    const newStock = product.stock - +newSale.qty;
    const [{ data: saleData, error: saleErr }, { error: stockErr }] = await Promise.all([
      supabase.from("sales").insert([saleRow]).select(),
      supabase.from("products").update({ stock: newStock }).eq("id", product.id),
    ]);
    if (saleErr || stockErr) return showToast("Error recording sale", "error");
    setSales([saleData[0], ...sales]);
    setProducts(products.map(p => p.id === product.id ? { ...p, stock: newStock } : p));
    setNewSale({ productId: "", qty: "", team: "" });
    setShowAddSale(false);
    showToast("Sale recorded!");
  };

  const handleAddOrder = async () => {
    const product = products.find(p => p.id === +newOrder.productId);
    if (!product || !newOrder.qty || !newOrder.supplier || !newOrder.eta) return showToast("Please fill all fields", "error");
    const row = { product_name: product.name, qty: +newOrder.qty, supplier: newOrder.supplier, eta: newOrder.eta, status: "Confirmed" };
    const { data, error } = await supabase.from("orders").insert([row]).select();
    if (error) return showToast("Error placing order", "error");
    setOrders([data[0], ...orders]);
    setNewOrder({ productId: "", qty: "", supplier: "", eta: "" });
    setShowAddOrder(false);
    showToast("Order placed!");
  };

  const receiveOrder = async (orderId) => {
    const order = orders.find(o => o.id === orderId);
    const product = products.find(p => p.name === order.product_name);
    const updates = [supabase.from("orders").update({ status: "Received" }).eq("id", orderId)];
    if (product) updates.push(supabase.from("products").update({ stock: product.stock + order.qty }).eq("id", product.id));
    await Promise.all(updates);
    setOrders(orders.map(o => o.id === orderId ? { ...o, status: "Received" } : o));
    if (product) setProducts(products.map(p => p.id === product.id ? { ...p, stock: p.stock + order.qty } : p));
    showToast("Stock updated!");
  };

  const updateStock = async (id, delta) => {
    const product = products.find(p => p.id === id);
    const newStock = Math.max(0, product.stock + delta);
    await supabase.from("products").update({ stock: newStock }).eq("id", id);
    setProducts(products.map(p => p.id === id ? { ...p, stock: newStock } : p));
  };

  const deleteProduct = async (id) => {
    await supabase.from("products").delete().eq("id", id);
    setProducts(products.filter(p => p.id !== id));
    showToast("Product removed");
  };

  const stockColor = (p) => { if (p.stock === 0) return "#ef4444"; if (p.stock <= p.low_stock_threshold) return "#f97316"; return "#22c55e"; };
  const stockPct = (p) => Math.min(100, (p.stock / ((p.low_stock_threshold || 1) * 3)) * 100);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #1a0f00, #2d1810)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, color: "#c9a882", fontFamily: "Georgia, serif" }}>
      <div style={{ fontSize: 48 }}>🫓</div>
      <div style={{ fontSize: 18 }}>Connecting to your database...</div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Georgia', serif", minHeight: "100vh", background: "linear-gradient(135deg, #1a0f00 0%, #2d1810 50%, #1a0f00 100%)", color: "#f5e6d3" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Source+Sans+3:wght@400;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .tab-btn { background: none; border: none; color: #c9a882; cursor: pointer; padding: 10px 18px; font-size: 14px; font-family: 'Source Sans 3', sans-serif; font-weight: 600; border-radius: 8px; transition: all 0.2s; }
        .tab-btn.active { background: #c9a882; color: #1a0f00; }
        .tab-btn:hover:not(.active) { background: rgba(201,168,130,0.15); color: #f5e6d3; }
        .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(201,168,130,0.2); border-radius: 16px; padding: 20px; }
        .btn { padding: 10px 20px; border-radius: 10px; border: none; cursor: pointer; font-family: 'Source Sans 3', sans-serif; font-weight: 600; font-size: 14px; transition: all 0.2s; }
        .btn-primary { background: #c9a882; color: #1a0f00; }
        .btn-primary:hover { background: #e8c9a0; transform: translateY(-1px); }
        .btn-danger { background: rgba(239,68,68,0.2); color: #fca5a5; border: 1px solid rgba(239,68,68,0.3); padding: 6px 12px; font-size: 12px; }
        .btn-sm { background: rgba(201,168,130,0.15); color: #c9a882; border: 1px solid rgba(201,168,130,0.3); padding: 6px 14px; font-size: 13px; }
        .btn-sm:hover { background: rgba(201,168,130,0.3); }
        input, select { background: rgba(255,255,255,0.08); border: 1px solid rgba(201,168,130,0.3); border-radius: 8px; color: #f5e6d3; padding: 10px 14px; font-size: 14px; font-family: 'Source Sans 3', sans-serif; width: 100%; outline: none; }
        input:focus, select:focus { border-color: #c9a882; }
        input::placeholder { color: rgba(245,230,211,0.4); }
        select option { background: #2d1810; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; }
        .modal { background: #2d1810; border: 1px solid rgba(201,168,130,0.3); border-radius: 20px; padding: 28px; width: 100%; max-width: 440px; }
        .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }
        .badge-warn { background: rgba(249,115,22,0.2); color: #fb923c; border: 1px solid rgba(249,115,22,0.3); }
        .badge-ok { background: rgba(34,197,94,0.2); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); }
        .badge-empty { background: rgba(239,68,68,0.2); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
        .badge-info { background: rgba(59,130,246,0.2); color: #93c5fd; border: 1px solid rgba(59,130,246,0.3); }
        .stock-bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,0.1); overflow: hidden; margin-top: 6px; }
        .alert-pulse { animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
        .toast { position: fixed; bottom: 24px; right: 24px; padding: 14px 22px; border-radius: 12px; font-size: 14px; font-weight: 600; z-index: 200; animation: slideUp 0.3s ease; font-family: 'Source Sans 3', sans-serif; }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @media (max-width: 600px) { .grid-3 { grid-template-columns: 1fr 1fr !important; } .grid-4 { grid-template-columns: 1fr 1fr !important; } }
      `}</style>

      <div style={{ background: "rgba(0,0,0,0.4)", borderBottom: "1px solid rgba(201,168,130,0.2)", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 32 }}>🫓</div>
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: "#c9a882", letterSpacing: 1 }}>TORTILLA CO.</div>
            <div style={{ fontSize: 12, color: "rgba(201,168,130,0.6)", letterSpacing: 2, textTransform: "uppercase" }}>Inventory System · Live</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {lowStockItems.length > 0 && (
            <div className="alert-pulse" style={{ background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.4)", borderRadius: 10, padding: "8px 16px", fontSize: 13, color: "#fb923c" }}>
              ⚠️ {lowStockItems.length} low on stock
            </div>
          )}
          <button className="btn btn-sm" onClick={loadAll}>↻ Refresh</button>
        </div>
      </div>

      <div style={{ background: "rgba(0,0,0,0.2)", borderBottom: "1px solid rgba(201,168,130,0.1)", padding: "8px 20px", display: "flex", gap: 4, overflowX: "auto" }}>
        {TABS.map(tab => <button key={tab} className={`tab-btn ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>{tab}</button>)}
      </div>

      <div style={{ padding: "24px", maxWidth: 1100, margin: "0 auto" }}>

        {activeTab === "Dashboard" && (
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, marginBottom: 24, color: "#e8c9a0" }}>Overview</div>
            <div className="grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
              {[
                { label: "Total Products", value: products.length, icon: "🫓", color: "#c9a882" },
                { label: "Stock Value", value: `$${totalValue.toFixed(0)}`, icon: "💰", color: "#4ade80" },
                { label: "Low Stock Alerts", value: lowStockItems.length, icon: "⚠️", color: "#fb923c" },
                { label: "Sales Revenue", value: `$${totalSalesValue.toFixed(2)}`, icon: "📈", color: "#93c5fd" },
              ].map(stat => (
                <div key={stat.label} className="card" style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{stat.icon}</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: stat.color, fontFamily: "'Playfair Display', serif" }}>{stat.value}</div>
                  <div style={{ fontSize: 12, color: "rgba(245,230,211,0.6)", marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>{stat.label}</div>
                </div>
              ))}
            </div>
            {lowStockItems.length > 0 && (
              <div className="card" style={{ marginBottom: 24, borderColor: "rgba(249,115,22,0.4)" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#fb923c", marginBottom: 16 }}>⚠️ Low Stock Alerts</div>
                {lowStockItems.map(p => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(249,115,22,0.08)", borderRadius: 10, padding: "12px 16px", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: 13, color: "rgba(245,230,211,0.5)" }}>Threshold: {p.low_stock_threshold} {p.unit}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span className={`badge ${p.stock === 0 ? "badge-empty" : "badge-warn"}`}>{p.stock === 0 ? "OUT OF STOCK" : `${p.stock} left`}</span>
                      <div style={{ marginTop: 6 }}><button className="btn btn-sm" onClick={() => setActiveTab("Orders")}>Order Now</button></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="card">
              <div style={{ fontSize: 16, fontWeight: 700, color: "#c9a882", marginBottom: 16 }}>Recent Sales</div>
              {sales.length === 0 && <div style={{ color: "rgba(245,230,211,0.4)", textAlign: "center", padding: 20 }}>No sales recorded yet.</div>}
              {sales.slice(0, 5).map(s => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(201,168,130,0.1)", fontSize: 14 }}>
                  <div><span style={{ fontWeight: 600 }}>{s.product_name}</span><span style={{ color: "rgba(245,230,211,0.5)", marginLeft: 8 }}>· {s.team}</span></div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "#4ade80", fontWeight: 600 }}>${s.total}</div>
                    <div style={{ fontSize: 12, color: "rgba(245,230,211,0.4)" }}>{s.date}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "Inventory" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: "#e8c9a0" }}>Inventory</div>
              <div style={{ display: "flex", gap: 10 }}>
                <select style={{ width: "auto" }} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <button className="btn btn-primary" onClick={() => setShowAddProduct(true)}>+ Add Product</button>
              </div>
            </div>
            {filteredProducts.length === 0 && <div className="card" style={{ textAlign: "center", color: "rgba(245,230,211,0.4)", padding: 40 }}>No products yet. Add your first tortilla product!</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredProducts.map(p => (
                <div key={p.id} className="card" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                    <div style={{ fontSize: 13, color: "rgba(245,230,211,0.5)", marginTop: 2 }}>{p.category} · ${p.price}/{p.unit}</div>
                    <div className="stock-bar"><div style={{ width: `${stockPct(p)}%`, height: "100%", background: stockColor(p), borderRadius: 3 }} /></div>
                  </div>
                  <div style={{ textAlign: "center", minWidth: 80 }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: stockColor(p) }}>{p.stock}</div>
                    <div style={{ fontSize: 12, color: "rgba(245,230,211,0.5)" }}>{p.unit}</div>
                    <span className={`badge ${p.stock === 0 ? "badge-empty" : p.stock <= p.low_stock_threshold ? "badge-warn" : "badge-ok"}`} style={{ marginTop: 4, display: "inline-block" }}>
                      {p.stock === 0 ? "Empty" : p.stock <= p.low_stock_threshold ? "Low" : "OK"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-sm" onClick={() => updateStock(p.id, -1)}>−</button>
                    <button className="btn btn-sm" onClick={() => updateStock(p.id, 1)}>+</button>
                    <button className="btn btn-sm" onClick={() => updateStock(p.id, 10)}>+10</button>
                    <button className="btn btn-danger" onClick={() => deleteProduct(p.id)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "Sales" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: "#e8c9a0" }}>Sales Tracker</div>
              <button className="btn btn-primary" onClick={() => setShowAddSale(true)}>+ Record Sale</button>
            </div>
            <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
              {[{ label: "Total Sales", value: sales.length }, { label: "Revenue", value: `$${totalSalesValue.toFixed(2)}` }, { label: "Units Sold", value: sales.reduce((s, x) => s + x.qty, 0) }].map(s => (
                <div key={s.label} className="card" style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#4ade80", fontFamily: "'Playfair Display', serif" }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: "rgba(245,230,211,0.5)", textTransform: "uppercase", letterSpacing: 1, marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div className="card">
              {sales.length === 0 && <div style={{ color: "rgba(245,230,211,0.4)", textAlign: "center", padding: 30 }}>No sales yet. Record your first sale!</div>}
              {sales.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(201,168,130,0.2)" }}>
                        {["Date", "Product", "Qty", "Revenue", "Team Member"].map(h => <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: "#c9a882", fontWeight: 600, fontSize: 12, textTransform: "uppercase" }}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {sales.map(s => (
                        <tr key={s.id} style={{ borderBottom: "1px solid rgba(201,168,130,0.08)" }}>
                          <td style={{ padding: "12px 14px", color: "rgba(245,230,211,0.5)" }}>{s.date}</td>
                          <td style={{ padding: "12px 14px", fontWeight: 600 }}>{s.product_name}</td>
                          <td style={{ padding: "12px 14px" }}>{s.qty}</td>
                          <td style={{ padding: "12px 14px", color: "#4ade80", fontWeight: 600 }}>${s.total}</td>
                          <td style={{ padding: "12px 14px" }}><span className="badge badge-info">{s.team}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "Orders" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: "#e8c9a0" }}>Purchase Orders</div>
              <button className="btn btn-primary" onClick={() => setShowAddOrder(true)}>+ New Order</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {orders.length === 0 && <div className="card" style={{ textAlign: "center", color: "rgba(245,230,211,0.4)", padding: 40 }}>No orders yet. Place your first order!</div>}
              {orders.map(o => (
                <div key={o.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{o.product_name}</div>
                    <div style={{ fontSize: 13, color: "rgba(245,230,211,0.5)", marginTop: 3 }}>Supplier: {o.supplier} · ETA: {o.eta}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontWeight: 700, fontSize: 18, color: "#c9a882" }}>{o.qty}</div>
                      <div style={{ fontSize: 11, color: "rgba(245,230,211,0.4)" }}>units</div>
                    </div>
                    <span className={`badge ${o.status === "Received" ? "badge-ok" : o.status === "In Transit" ? "badge-warn" : "badge-info"}`}>{o.status}</span>
                    {o.status !== "Received" && <button className="btn btn-sm" onClick={() => receiveOrder(o.id)}>Mark Received</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showAddProduct && (
        <div className="modal-overlay" onClick={() => setShowAddProduct(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, marginBottom: 20, color: "#c9a882" }}>Add New Product</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <input placeholder="Product name" value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} />
              <select value={newProduct.category} onChange={e => setNewProduct({ ...newProduct, category: e.target.value })}>
                {["Flour", "Corn", "Wheat", "Specialty"].map(c => <option key={c}>{c}</option>)}
              </select>
              <input type="number" placeholder="Initial stock quantity" value={newProduct.stock} onChange={e => setNewProduct({ ...newProduct, stock: e.target.value })} />
              <input type="number" placeholder="Low stock alert threshold (e.g. 20)" value={newProduct.low_stock_threshold} onChange={e => setNewProduct({ ...newProduct, low_stock_threshold: e.target.value })} />
              <input type="number" step="0.01" placeholder="Price per pack ($)" value={newProduct.price} onChange={e => setNewProduct({ ...newProduct, price: e.target.value })} />
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleAddProduct}>Add Product</button>
                <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => setShowAddProduct(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddSale && (
        <div className="modal-overlay" onClick={() => setShowAddSale(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, marginBottom: 20, color: "#c9a882" }}>Record Sale</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <select value={newSale.productId} onChange={e => setNewSale({ ...newSale, productId: e.target.value })}>
                <option value="">Select product...</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock})</option>)}
              </select>
              <input type="number" placeholder="Quantity sold" value={newSale.qty} onChange={e => setNewSale({ ...newSale, qty: e.target.value })} />
              <input placeholder="Team member name" value={newSale.team} onChange={e => setNewSale({ ...newSale, team: e.target.value })} />
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleAddSale}>Record</button>
                <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => setShowAddSale(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddOrder && (
        <div className="modal-overlay" onClick={() => setShowAddOrder(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, marginBottom: 20, color: "#c9a882" }}>Place Order</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <select value={newOrder.productId} onChange={e => setNewOrder({ ...newOrder, productId: e.target.value })}>
                <option value="">Select product...</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="number" placeholder="Quantity to order" value={newOrder.qty} onChange={e => setNewOrder({ ...newOrder, qty: e.target.value })} />
              <input placeholder="Supplier name" value={newOrder.supplier} onChange={e => setNewOrder({ ...newOrder, supplier: e.target.value })} />
              <input type="date" value={newOrder.eta} onChange={e => setNewOrder({ ...newOrder, eta: e.target.value })} />
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleAddOrder}>Place Order</button>
                <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => setShowAddOrder(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" style={{ background: toast.type === "error" ? "rgba(239,68,68,0.9)" : "rgba(34,197,94,0.9)", color: "#fff" }}>
          {toast.type === "error" ? "❌" : "✅"} {toast.msg}
        </div>
      )}
    </div>
  );
}
