import { writable } from 'svelte/store';
import { browser } from '$app/environment'
import { aiActivity } from '$lib/activities.js'

import Anthropic from '@anthropic-ai/sdk';

var client = null;
var messages = [];

export function setApiKey(key)
{
	client = new Anthropic({apiKey: key, dangerouslyAllowBrowser: true});
	// Reset messages
	messages = []
	messageList.set(messages);
	localStorage.setItem("anthropic-api-key", key);
	apiState.set("READY");
}

function clearApiKey()
{
	localStorage.removeItem("anthropic-api-key");
	apiState.set("KEY_REQUIRED");
}

function addMessageInternal(role, content)
{
	messages.push({role: role, content: content});
	messageList.set(messages);
}

async function sendMessages(handleTool)
{
	aiActivity.set(true);
	try
	{
		var tools = [
			{ "type": "bash_20241022", "name": "bash" }
		];
		const response = await client.beta.messages.create({max_tokens: 1024, messages: messages, model: 'claude-3-5-sonnet-20241022', tools: tools, betas: ["computer-use-2024-10-22"]}); 
		var content = response.content;
		// Be robust to multiple response
		for(var i=0;i<content.length;i++)
		{
			var c = content[i];
			if(c.type == "text")
			{
				addMessageInternal(response.role, c.text);
			}
			else if(c.type == "tool_use")
			{
				addMessageInternal(response.role, [c]);
				var commandResponse = await handleTool(c.input);
				addMessageInternal("user", [{type: "tool_result", tool_use_id: c.id, content: commandResponse}]);
				sendMessages(handleTool);
			}
			else
			{
				debugger;
			}
		}
		if(response.stop_reason == "end_turn")
			aiActivity.set(false);
	}
	catch(e)
	{
		if(e.status == 401)
		{
			addMessageInternal('error', 'Invalid API key');
			clearApiKey();
		}
		else
		{
			addMessageInternal('error', e.error.error.message);
		}
			
	}
}

export function addMessage(text, handleTool)
{
	addMessageInternal('user', text);
	sendMessages(handleTool);
}

function initialize()
{
	var savedApiKey = localStorage.getItem("anthropic-api-key");
	if(savedApiKey)
		setApiKey(savedApiKey);
}

export const apiState = writable("KEY_REQUIRED");
export const messageList = writable(messages);

if(browser)
	initialize();
