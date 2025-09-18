// scripts/healthCheck.js

require('dotenv').config();
const qdrant = require('../config/qdrant');
const redisClient = require('../config/redis');
const embeddings = require('../config/embeddings');
const { model: geminiModel } = require('../config/gemini');

class HealthChecker {
    constructor() {
        this.services = {
            qdrant: { name: 'Qdrant Vector DB', status: 'pending' },
            redis: { name: 'Redis Cache', status: 'pending' },
            embeddings: { name: 'Embeddings API (Google)', status: 'pending' },
            gemini: { name: 'Gemini LLM API', status: 'pending' }
        };
    }

    async checkQdrant() {
        try {
            if (!process.env.QDRANT_URL) throw new Error('QDRANT_URL is not set.');
            // A simple way to check is to get collection info.
            await qdrant.client.getCollection(qdrant.collectionName);
            this.services.qdrant = { ...this.services.qdrant, status: 'healthy', details: { url: process.env.QDRANT_URL, collection: qdrant.collectionName }};
        } catch (error) {
            this.services.qdrant = { ...this.services.qdrant, status: 'unhealthy', error: error.message };
        }
    }

    async checkRedis() {
        try {
            if (!process.env.REDIS_URL) throw new Error('REDIS_URL is not set.');
            // Ping the Redis server. It should reply with 'PONG'.
            const reply = await redisClient.ping();
            if (reply !== 'PONG') throw new Error('Received unexpected reply from Redis.');
            this.services.redis = { ...this.services.redis, status: 'healthy', details: { url: process.env.REDIS_URL.split('@')[1] || process.env.REDIS_URL }};
        } catch (error) {
            this.services.redis = { ...this.services.redis, status: 'unhealthy', error: error.message };
        }
    }

    async checkEmbeddings() {
        try {
            if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set for embeddings.');
            // Make a small, cheap embedding call to validate the API key and service.
            await embeddings.embedSingle('health check');
            this.services.embeddings = { ...this.services.embeddings, status: 'healthy', details: { model: embeddings.modelName, apiKey: 'Configured' }};
        } catch (error) {
            this.services.embeddings = { ...this.services.embeddings, status: 'unhealthy', error: error.message };
        }
    }

    async checkGemini() {
        try {
            if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set for generation.');
            // A countTokens call is a cheap way to validate the model and API key.
            await geminiModel.countTokens('health check');
            this.services.gemini = { ...this.services.gemini, status: 'healthy', details: { model: geminiModel.model, apiKey: 'Configured' }};
        } catch (error) {
            this.services.gemini = { ...this.services.gemini, status: 'unhealthy', error: error.message };
        }
    }

    async checkEnvironmentVariables() {
        const requiredVars = ['GEMINI_API_KEY'];
        const optionalVars = [
            'REDIS_URL', 'QDRANT_URL', 'RSS_FEEDS', 'SESSION_TTL', 'CACHE_TTL',
            'MAX_CONTEXT_LENGTH', 'TOP_K_RESULTS', 'SIMILARITY_THRESHOLD', 'FRONTEND_URL', 'PORT'
        ];
        const envStatus = { required: {}, optional: {} };

        for (const varName of requiredVars) {
            envStatus.required[varName] = {
                configured: !!process.env[varName],
                masked: process.env[varName] ? `${process.env[varName].substring(0, 8)}...` : 'NOT_SET'
            };
        }
        for (const varName of optionalVars) {
            envStatus.optional[varName] = {
                configured: !!process.env[varName],
                value: process.env[varName] || 'default'
            };
        }
        return envStatus;
    }

    async runFullHealthCheck() {
        console.log('🏥 Starting comprehensive health check...\n');
        await Promise.all([
            this.checkQdrant(),
            this.checkRedis(),
            this.checkEmbeddings(),
            this.checkGemini()
        ]);
        const envStatus = await this.checkEnvironmentVariables();
        this.displayResults(envStatus);
        return this.getOverallHealth();
    }

    displayResults(envStatus) {
        console.log('🔍 Service Health Status:');
        console.log('═'.repeat(60));
        for (const [key, service] of Object.entries(this.services)) {
            const statusIcon = service.status === 'healthy' ? '✅' : '❌';
            console.log(`${statusIcon} ${service.name}: ${service.status.toUpperCase()}`);
            if (service.details) {
                for (const [detailKey, detailValue] of Object.entries(service.details)) {
                    console.log(`   ${detailKey}: ${detailValue}`);
                }
            }
            if (service.error) {
                console.log(`   Error: ${service.error}`);
            }
            console.log();
        }

        console.log('🔧 Environment Configuration:');
        console.log('─'.repeat(40));
        console.log('Required Variables:');
        for (const [varName, varInfo] of Object.entries(envStatus.required)) {
            const icon = varInfo.configured ? '✅' : '❌';
            console.log(`   ${icon} ${varName}: ${varInfo.masked}`);
        }
        console.log('\nOptional Variables:');
        for (const [varName, varInfo] of Object.entries(envStatus.optional)) {
            const icon = varInfo.configured ? '✅' : '⚠️';
            const value = varInfo.value.length > 50 ? varInfo.value.substring(0, 50) + '...' : varInfo.value;
            console.log(`   ${icon} ${varName}: ${value}`);
        }
    }

    getOverallHealth() {
        const healthyServices = Object.values(this.services).filter(s => s.status === 'healthy').length;
        const totalServices = Object.keys(this.services).length;
        const healthPercentage = totalServices > 0 ? (healthyServices / totalServices) * 100 : 100;
        const overallStatus = {
            healthy: healthyServices,
            total: totalServices,
            percentage: healthPercentage,
            status: healthPercentage === 100 ? 'healthy' : healthPercentage >= 75 ? 'degraded' : 'unhealthy',
            timestamp: new Date().toISOString()
        };

        console.log('\n📊 Overall System Health:');
        console.log('═'.repeat(40));
        console.log(`Status: ${overallStatus.status.toUpperCase()}`);
        console.log(`Services: ${overallStatus.healthy}/${overallStatus.total} healthy (${overallStatus.percentage.toFixed(1)}%)`);
        console.log(`Timestamp: ${new Date(overallStatus.timestamp).toLocaleString()}`);

        if (overallStatus.status === 'healthy') {
            console.log('\n🎉 All systems are operational!');
        } else {
            console.log('\n⚠️  Some services need attention.');
        }
        return overallStatus;
    }
}

module.exports = HealthChecker;

if (require.main === module) {
    const checker = new HealthChecker();
    checker.runFullHealthCheck()
        .then(result => {
            process.exit(result.status === 'healthy' ? 0 : 1);
        })
        .catch(error => {
            console.error('💥 Health check failed:', error.message);
            process.exit(1);
        });
}