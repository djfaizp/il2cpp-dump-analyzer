/**
 * IL2CPP Dump Analyzer MCP Client Helper
 * 
 * This helper provides easy integration with your MCP server.
 * Use this in your "roo code" to interact with the IL2CPP analyzer.
 */

class IL2CPPMCPClient {
    constructor(serverUrl = 'http://localhost:3000/mcp') {
        this.serverUrl = serverUrl;
        this.sessionId = null;
        this.requestId = 1;
    }

    /**
     * Initialize the MCP session
     */
    async initialize() {
        const response = await this._makeRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            clientInfo: {
                name: 'il2cpp-client',
                version: '1.0.0'
            }
        });

        this.sessionId = response.headers.get('mcp-session-id');
        return response.data;
    }

    /**
     * Search for code in the IL2CPP dump
     * @param {string} query - Search query
     * @param {string} filterType - Optional filter by type (class, method, enum, interface)
     * @param {number} topK - Number of results to return (default: 5)
     */
    async searchCode(query, filterType = null, topK = 5) {
        const args = { query, top_k: topK };
        if (filterType) args.filter_type = filterType;

        const response = await this._callTool('search_code', args);
        if (!response.data.result || !response.data.result.content || !response.data.result.content[0]) {
            console.error('Unexpected response format:', JSON.stringify(response, null, 2));
            throw new Error('Invalid response format from search_code tool');
        }
        return JSON.parse(response.data.result.content[0].text);
    }

    /**
     * Find MonoBehaviour classes
     * @param {string} query - Optional search query to filter MonoBehaviours
     * @param {number} topK - Number of results to return (default: 10)
     */
    async findMonoBehaviours(query = '', topK = 10) {
        const response = await this._callTool('find_monobehaviours', { query, top_k: topK });
        if (!response.data.result || !response.data.result.content || !response.data.result.content[0]) {
            console.error('Unexpected response format:', JSON.stringify(response, null, 2));
            throw new Error('Invalid response format from find_monobehaviours tool');
        }
        return JSON.parse(response.data.result.content[0].text);
    }

    /**
     * Find class hierarchy information
     * @param {string} className - Name of the class
     * @param {boolean} includeMethods - Whether to include methods (default: true)
     */
    async findClassHierarchy(className, includeMethods = true) {
        const response = await this._callTool('find_class_hierarchy', {
            class_name: className,
            include_methods: includeMethods
        });
        if (!response.data.result || !response.data.result.content || !response.data.result.content[0]) {
            console.error('Unexpected response format:', JSON.stringify(response, null, 2));
            throw new Error('Invalid response format from find_class_hierarchy tool');
        }
        return JSON.parse(response.data.result.content[0].text);
    }

    /**
     * Find enum values
     * @param {string} enumName - Name of the enum
     */
    async findEnumValues(enumName) {
        const response = await this._callTool('find_enum_values', { enum_name: enumName });
        if (!response.data.result || !response.data.result.content || !response.data.result.content[0]) {
            console.error('Unexpected response format:', JSON.stringify(response, null, 2));
            throw new Error('Invalid response format from find_enum_values tool');
        }
        return JSON.parse(response.data.result.content[0].text);
    }

    /**
     * Call a tool on the MCP server
     * @private
     */
    async _callTool(toolName, args) {
        return await this._makeRequest('tools/call', {
            name: toolName,
            arguments: args
        });
    }

    /**
     * Make a request to the MCP server
     * @private
     */
    async _makeRequest(method, params) {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream'
        };

        if (this.sessionId) {
            headers['mcp-session-id'] = this.sessionId;
        }

        const response = await fetch(this.serverUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: this.requestId++,
                method,
                params
            })
        });

        // Parse SSE response
        const text = await response.text();
        const lines = text.split('\n');
        let jsonData = '';

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                jsonData += line.substring(6);
            }
        }

        const data = JSON.parse(jsonData);
        return { data, headers: response.headers };
    }
}

// Example usage
async function example() {
    const client = new IL2CPPMCPClient();
    
    try {
        // Initialize the client
        await client.initialize();
        console.log('✓ MCP client initialized');

        // Search for MonoBehaviour classes
        const monoBehaviours = await client.findMonoBehaviours('Player');
        console.log('Found MonoBehaviours:', monoBehaviours);

        // Search for specific code
        const searchResults = await client.searchCode('Update', 'method', 3);
        console.log('Update methods:', searchResults);

        // Get class hierarchy
        if (monoBehaviours.length > 0) {
            const hierarchy = await client.findClassHierarchy(monoBehaviours[0].name);
            console.log('Class hierarchy:', hierarchy);
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = IL2CPPMCPClient;
}

// Run example if this file is executed directly
if (require.main === module) {
    example();
}