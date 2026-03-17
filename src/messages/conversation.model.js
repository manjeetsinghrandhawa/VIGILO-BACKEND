import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";

const Conversation = sequelize.define("Conversation", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },

  type: {
    type: DataTypes.ENUM("direct"),
    defaultValue: "direct"
  }

}, {
  tableName: "conversations",
  timestamps: true
});

export default Conversation;