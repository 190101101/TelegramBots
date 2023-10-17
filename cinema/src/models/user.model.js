const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    telegramId: {
        type:Number,
        required:true,
    },
    films:{
        type:[String],
        default:[]
    }
})

const User = mongoose.model('User', UserSchema);
module.exports = User;
