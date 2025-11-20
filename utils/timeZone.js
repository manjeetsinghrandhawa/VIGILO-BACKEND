import moment from "moment-timezone";


/**
 * Convert local date (with timezone info) to UTC before storing
 */
export const toUTC = (dateString) => {
  if (!dateString) return null;
  return moment.utc(dateString, moment.ISO_8601).toDate();
};


export const getTimeZone = () => {
  return "Asia/Kolkata"; // change here if your production timezone differs
};