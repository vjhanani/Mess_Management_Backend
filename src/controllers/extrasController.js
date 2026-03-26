// controllers/extrasController.js

const ExtraItem = require("../models/ExtraItem");
const ExtraPurchase = require("../models/ExtraPurchase");
const Student = require("../models/Student");
const { Op } = require("sequelize");

const getCurrentMeal = () => {
  const hour = new Date().getHours();
  if (hour < 11) return "Breakfast";
  if (hour < 17) return "Lunch";
  return "Dinner";
};

exports.addExtraItem = async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ error: "Only manager allowed" });
    }

    const item = await ExtraItem.create(req.body);

    res.json({ message: "Item added", item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateExtraItem = async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ error: "Only manager allowed" });
    }

    const item = await ExtraItem.findByPk(req.params.id);
    if (!item) return res.status(404).json({ error: "Item not found" });

    await item.update(req.body);

    res.json({ message: "Item updated", item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteExtraItem = async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ error: "Only manager allowed" });
    }

    await ExtraItem.destroy({ where: { id: req.params.id } });

    res.json({ message: "Item deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAllExtras = async (req, res) => {
  try {
    const days = [
      "Sunday","Monday","Tuesday","Wednesday",
      "Thursday","Friday","Saturday"
    ];

    const today = days[new Date().getDay()];
    const currentMeal = getCurrentMeal();

    const items = await ExtraItem.findAll({
      where: {
        isAvailable: true,
        [Op.and]: [
          {
            day: {
              [Op.or]: [today, "All"]
            }
          },
          {
            mealType: {
              [Op.or]: [currentMeal, "All"]
            }
          }
        ]
      }
    });

    res.json({
      day: today,
      mealType: currentMeal,
      items
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.buyExtras = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ error: "Only students allowed" });
    }

    const studentId = req.user.rollNo;
    const { items } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "No items selected" });
    }

    const days = [
      "Sunday","Monday","Tuesday","Wednesday",
      "Thursday","Friday","Saturday"
    ];

    const today = days[new Date().getDay()];

    const getCurrentMeal = () => {
      const hour = new Date().getHours();
      if (hour < 11) return "Breakfast";
      if (hour < 17) return "Lunch";
      return "Dinner";
    };

    const currentMeal = getCurrentMeal();

    let totalAmount = 0;
    const purchases = [];

    for (const item of items) {
      const extra = await ExtraItem.findByPk(item.itemId);

      if (!extra) {
        return res.status(404).json({
          error: `Item not found`
        });
      }

      if (!extra.isAvailable) {
        return res.status(400).json({
          error: `${extra.name} is not available`
        });
      }

      if (
        !(extra.day === "All" || extra.day === today) ||
        !(extra.mealType === "All" || extra.mealType === currentMeal)
      ) {
        return res.status(400).json({
          error: `${extra.name} not available for ${today} ${currentMeal}`
        });
      }

      if (!item.quantity || item.quantity <= 0) {
        return res.status(400).json({
          error: `Invalid quantity for ${extra.name}`
        });
      }

      if (extra.stockQuantity < item.quantity) {
        return res.status(400).json({
          error: `Not enough stock for ${extra.name}`
        });
      }

      const price = parseFloat(extra.price) * item.quantity;

      extra.stockQuantity -= item.quantity;
      await extra.save();

      const purchase = await ExtraPurchase.create({
        StudentRollNo: studentId,
        ExtraItemId: extra.id,
        quantity: item.quantity,
        totalPrice: price
      });

      totalAmount += price;

      purchases.push({
        itemName: extra.name,
        quantity: item.quantity,
        price: price
      });
    }

    res.json({
      message: "Purchase successful",
      day: today,
      mealType: currentMeal,
      totalAmount,
      purchases
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getMyExtras = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ error: "Only students allowed" });
    }

    const purchases = await ExtraPurchase.findAll({
      where: { StudentRollNo: req.user.rollNo },
      include: [{ model: ExtraItem }]
    });

    let total = 0;

    purchases.forEach(p => {
      total += parseFloat(p.totalPrice);
    });

    res.json({
      totalAmount: total,
      history: purchases
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getExtrasAnalytics = async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ error: "Only manager allowed" });
    }

    const purchases = await ExtraPurchase.findAll({
      include: [ExtraItem]
    });

    let totalRevenue = 0;
    let itemStats = {};

    purchases.forEach(p => {
      totalRevenue += parseFloat(p.totalPrice);

      const name = p.ExtraItem.name;

      if (!itemStats[name]) {
        itemStats[name] = {
          quantity: 0,
          revenue: 0
        };
      }

      itemStats[name].quantity += p.quantity;
      itemStats[name].revenue += parseFloat(p.totalPrice);
    });

    res.json({
      totalRevenue,
      items: itemStats
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
