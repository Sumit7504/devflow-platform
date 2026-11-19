const express = require("express");
const router = express.Router();

const {
  createCompany,
  getMyCompany,
  updateMyCompany,
  getCompanyById,
} = require("../controllers/companyController");

const auth            = require("../middleware/auth");
const authorizeRoles  = require("../middleware/authorizeRoles");
const { companyRules, updateCompanyRules, validate } = require("../middleware/validators");

// /me routes declared BEFORE /:id so Express never treats "me" as an ObjectId param
router.post("/",    auth, authorizeRoles("recruiter"), companyRules,       validate, createCompany);
router.get( "/me",  auth, authorizeRoles("recruiter"), getMyCompany);
router.put( "/me",  auth, authorizeRoles("recruiter"), updateCompanyRules, validate, updateMyCompany);
router.get( "/:id", auth, getCompanyById);

module.exports = router;
