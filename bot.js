const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// 📊 SIMPLE DATA STORAGE
const DATA_FILE = 'data/shift-data.json';
let shiftData = {
    staff: [],
    shifts: [],
    settings: {}
};

// ⏰ ACTIVE SHIFTS TRACKING
const activeShifts = new Map();

// 🚀 INITIALIZE BOT
function initializeBot() {
    console.log('🤖 Starting Simple Shift Management Bot...');
    
    // Create data directory
    if (!fs.existsSync('data')) {
        fs.mkdirSync('data');
    }
    
    // Load existing data
    if (fs.existsSync(DATA_FILE)) {
        try {
            const rawData = fs.readFileSync(DATA_FILE, 'utf8');
            shiftData = JSON.parse(rawData);
            console.log(`✅ Loaded ${shiftData.staff.length} staff members`);
            console.log(`✅ Loaded ${shiftData.shifts.length} historical shifts`);
        } catch (error) {
            console.error('❌ Error loading data:', error);
            saveData();
        }
    } else {
        saveData();
    }
    
    // Auto-save every 5 minutes
    setInterval(saveData, 300000);
    console.log('💾 Auto-save enabled');
}

// 💾 SAVE DATA
function saveData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(shiftData, null, 2));
    } catch (error) {
        console.error('❌ Error saving data:', error);
    }
}

// 🎯 BOT READY
client.once('ready', () => {
    console.log(`\n🎉 Bot logged in as ${client.user.tag}!`);
    console.log(`👥 Registered staff: ${shiftData.staff.length}`);
    console.log(`📊 Total shifts: ${shiftData.shifts.length}`);
    console.log(`⏰ Active shifts: ${activeShifts.size}`);
    console.log(`🤖 Bot is ready! Use !help for commands\n`);
    
    client.user.setActivity('!help for commands', { type: 'WATCHING' });
});

// 💬 MESSAGE HANDLER
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guild || message.guild.id !== config.discord.guildId) return;

    const args = message.content.split(/ +/);
    const command = args.shift().toLowerCase();

    try {
        switch (command) {
            case '!register':
                await handleRegister(message, args);
                break;
            case '!clockin':
                await handleClockIn(message);
                break;
            case '!clockout':
                await handleClockOut(message);
                break;
            case '!mystatus':
                await handleStatus(message);
                break;
            case '!myshifts':
                await handleMyShifts(message);
                break;
            case '!admin-stats':
                await handleAdminStats(message);
                break;
            case '!help':
                await handleHelp(message);
                break;
            case '!ping':
                await handlePing(message);
                break;
        }
    } catch (error) {
        console.error('Command error:', error);
        await message.reply('❌ An error occurred. Please try again.');
    }
});

// 📝 REGISTER STAFF
async function handleRegister(message, args) {
    if (args.length < 2) {
        const embed = new EmbedBuilder()
            .setColor(0xFF6B6B)
            .setTitle('❌ Usage')
            .setDescription('`!register <role> <email>`\n**Example:** `!register Manager john@company.com`');
        return message.reply({ embeds: [embed] });
    }

    const userId = message.author.id;
    const username = message.author.tag;
    const role = args[0];
    const email = args[1];

    // Check if already registered
    const existing = shiftData.staff.find(s => s.userId === userId);
    if (existing) {
        return message.reply('❌ You are already registered!');
    }

    // Register new staff
    shiftData.staff.push({
        userId,
        username,
        role,
        email,
        registeredAt: new Date().toISOString()
    });

    saveData();

    const embed = new EmbedBuilder()
        .setColor(0x51CF66)
        .setTitle('✅ REGISTERED')
        .addFields(
            { name: '👤 User', value: username, inline: true },
            { name: '🎯 Role', value: role, inline: true },
            { name: '📧 Email', value: email, inline: true }
        )
        .setFooter({ text: `ID: ${userId}` })
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

// ⏰ CLOCK IN
async function handleClockIn(message) {
    const userId = message.author.id;

    // Check registration
    const staff = shiftData.staff.find(s => s.userId === userId);
    if (!staff) {
        return message.reply('❌ Register first: `!register <role> <email>`');
    }

    // Check if already clocked in
    if (activeShifts.has(userId)) {
        return message.reply('❌ You are already clocked in!');
    }

    const clockInTime = new Date();
    
    // Start shift
    activeShifts.set(userId, {
        username: staff.username,
        role: staff.role,
        clockIn: clockInTime
    });

    // Announce clock in
    const embed = new EmbedBuilder()
        .setColor(0x51CF66)
        .setTitle('🟢 CLOCKED IN')
        .setDescription(`**${staff.username}** started shift`)
        .addFields(
            { name: '🎯 Role', value: staff.role, inline: true },
            { name: '⏰ Time', value: `<t:${Math.floor(clockInTime.getTime()/1000)}:T>`, inline: true },
            { name: '📅 Date', value: `<t:${Math.floor(clockInTime.getTime()/1000)}:D>`, inline: true }
        )
        .setFooter({ text: `ID: ${userId}` })
        .setTimestamp();

    await message.channel.send({ embeds: [embed] });
    await message.reply('✅ Clocked in successfully!');
}

// 🏁 CLOCK OUT
async function handleClockOut(message) {
    const userId = message.author.id;

    // Check if clocked in
    if (!activeShifts.has(userId)) {
        return message.reply('❌ You are not clocked in!');
    }

    const shift = activeShifts.get(userId);
    const clockOutTime = new Date();
    const clockInTime = shift.clockIn;

    // Calculate time worked
    const timeDiff = clockOutTime - clockInTime;
    const totalMinutes = Math.floor(timeDiff / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    // Save shift
    shiftData.shifts.push({
        userId,
        username: shift.username,
        role: shift.role,
        clockIn: clockInTime.toISOString(),
        clockOut: clockOutTime.toISOString(),
        hours,
        minutes,
        totalMinutes,
        date: clockOutTime.toISOString().split('T')[0]
    });

    // Remove from active shifts
    activeShifts.delete(userId);
    saveData();

    // Announce clock out
    const embed = new EmbedBuilder()
        .setColor(0xFF922B)
        .setTitle('🔴 CLOCKED OUT')
        .setDescription(`**${shift.username}** ended shift`)
        .addFields(
            { name: '🎯 Role', value: shift.role, inline: true },
            { name: '⏱️ Worked', value: `${hours}h ${minutes}m`, inline: true },
            { name: '🕒 Clock Out', value: `<t:${Math.floor(clockOutTime.getTime()/1000)}:T>`, inline: true }
        )
        .setFooter({ text: `Total: ${totalMinutes} minutes` })
        .setTimestamp();

    await message.channel.send({ embeds: [embed] });
    await message.reply(`✅ Clocked out! Worked **${hours}h ${minutes}m**.`);
}

// 📊 CHECK STATUS
async function handleStatus(message) {
    const userId = message.author.id;
    const staff = shiftData.staff.find(s => s.userId === userId);

    if (!staff) {
        return message.reply('❌ Register first: `!register <role> <email>`');
    }

    const embed = new EmbedBuilder()
        .setColor(0x339AF0)
        .setTitle('📊 YOUR STATUS')
        .addFields(
            { name: '👤 User', value: staff.username, inline: true },
            { name: '🎯 Role', value: staff.role, inline: true },
            { name: '📧 Email', value: staff.email, inline: true }
        );

    if (activeShifts.has(userId)) {
        const shift = activeShifts.get(userId);
        const currentTime = new Date();
        const timeDiff = currentTime - shift.clockIn;
        const totalMinutes = Math.floor(timeDiff / (1000 * 60));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        embed.addFields(
            { name: '🟢 Status', value: 'CLOCKED IN', inline: true },
            { name: '⏱️ Duration', value: `${hours}h ${minutes}m`, inline: true },
            { name: '🕒 Clock In', value: `<t:${Math.floor(shift.clockIn.getTime()/1000)}:F>`, inline: false }
        );
    } else {
        const userShifts = shiftData.shifts.filter(s => s.userId === userId);
        embed.addFields(
            { name: '🔴 Status', value: 'CLOCKED OUT', inline: true },
            { name: '📈 Total Shifts', value: `${userShifts.length}`, inline: true }
        );
    }

    await message.reply({ embeds: [embed] });
}

// 📅 VIEW SHIFTS
async function handleMyShifts(message) {
    const userId = message.author.id;
    const userShifts = shiftData.shifts.filter(s => s.userId === userId).slice(-5).reverse();

    if (userShifts.length === 0) {
        return message.reply('📭 No shift history found.');
    }

    const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('📅 YOUR SHIFTS')
        .setDescription(`Last ${userShifts.length} shifts`);

    userShifts.forEach((shift, index) => {
        const clockInTime = new Date(shift.clockIn);
        embed.addFields({
            name: `📆 ${shift.date} - ${shift.hours}h ${shift.minutes}m`,
            value: `⏰ ${shift.role} | <t:${Math.floor(clockInTime.getTime()/1000)}:R>`,
            inline: false
        });
    });

    await message.reply({ embeds: [embed] });
}

// 👑 ADMIN STATS
async function handleAdminStats(message) {
    if (!message.member.permissions.has('ADMINISTRATOR')) {
        return message.reply('❌ Admin only.');
    }

    const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('👑 ADMIN STATS')
        .addFields(
            { name: '👥 Staff', value: `${shiftData.staff.length}`, inline: true },
            { name: '📈 Total Shifts', value: `${shiftData.shifts.length}`, inline: true },
            { name: '🟢 Active Now', value: `${activeShifts.size}`, inline: true }
        )
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

// 🆘 HELP
async function handleHelp(message) {
    const embed = new EmbedBuilder()
        .setColor(0x339AF0)
        .setTitle('🆘 SHIFT BOT HELP')
        .setDescription('Simple shift management system')
        .addFields(
            { name: '📝 Register', value: '`!register <role> <email>`' },
            { name: '⏰ Shift', value: '`!clockin` - Start shift\n`!clockout` - End shift' },
            { name: '📊 Info', value: '`!mystatus` - Check status\n`!myshifts` - View history' },
            { name: '👑 Admin', value: '`!admin-stats` - Statistics' }
        );

    await message.reply({ embeds: [embed] });
}

// 🏓 PING
async function handlePing(message) {
    await message.reply('🏓 Pong! Bot is online.');
}

// 🚀 START BOT
initializeBot();
client.login(config.discord.token);

// 🔧 ERROR HANDLING
process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
});
