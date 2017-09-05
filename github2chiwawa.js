var request = require('request'),
    config = require('./config.json');

// allをつけるイベントを判別
function toall(eventName) {
    var toall_flag = 0;
    console.log(eventName);
    for (var i = 1; i < config.toall_list.length; i++) {
        if (eventName == config.toall_list[i]) {
            toall_flag = 1;
        }
    }
    if (toall_flag == 1) {
        return "true";
    }
    else {
        return "false";
    }
}

// chiwawa通知用のjsonを作る
function setJson(data) {
    var message = {
        text: data.title,
        toAll: toall(data.eventName),
        from: {
            name: "Github",
            userid: config.data.chiwawa_user_id
        }
    };

    if (data.text !== "") {
        message.attachments = [
            {
                attachmentId: "detail",
                viewType: "text",
                textType: "md",
                textInTimeline: "",
                text: data.text
            }
        ];
    }
    return message;
}

// issue_commentとpull_requset_review_commentの時のデータの整形
function comment_text(msg, data) {
    const issue_comment_title = "#" + msg.issue.number + " " + msg.issue.title;
    var comment_type = (msg.issue.pul_request === undefined) ? 'Issue' : 'PullRequest';
    data.title += "New Comment by " + msg.comment.user.login;
    data.title += " on " + comment_type + " " + issue_comment_title;
    if (msg.issue.assignees.length !== 0) {
        data.title += "(assigned to ";
        for (var i = 0; i < msg.issue.assignees.length; i++) {
            if (i !== 0) {
                data.title += " and ";
            }
            data.title += msg.issue.assignees[i].login;
        }
        data.title += ")";
    }
    data.url = msg.issue.html_url;
    data.text += "[" + issue_comment_title + "]" + "(" + data.url + ")\n";
    data.text += msg.comment.body;

    return data;

}

// issuesの時のデータの整形
function issues_text(msg, data) {
    const issue_title = "#" + msg.issue.number + " " + msg.issue.title;
    if (msg.action == 'opened') {
        data.title += 'Issue created by ' + msg.sender.login;
        if (msg.issue.assignees.length !== 0) {
            data.title += "(assigned to ";
            for (var i = 0; i < msg.issue.assignees.length; i++) {
                if (i !== 0) {
                    data.title += " and ";
                }
                data.title += msg.issue.assignees[i].login;
            }
            data.title += ")";
        }
    }
    return data;
}

// pushの時のデータの整形
function push_text(msg, data) {
    if (msg.ref_type == 'branch') {
        data.title += 'New Branch ';
        data.title += '"' + msg.ref + '"';
        data.title += ' was Pushed by ';
        data.title += msg.head_commit.author.name;
    }
    else {
        data.title += msg.ref.replace("refs/heads/", "") + " was branched ";
        data.title += "from " + msg.repository.master_branch + " ";
        data.title += "and pushed by " + msg.head_commit.author.name;
    }

    data.url = msg.head_commit.url;
    return data;
}

// pull_request時のデータの整形
function pull_request_text(msg, data) {
    if (msg.action == 'opened') {
        data.title += "PullRequest submitted by " + msg.sender.login;
    }
    else if (msg.action == 'closed') {
        data.title += "PullRequest closed :" + msg.pull_request.title;
        data.title += " by " + msg.sender.login;
    }
    else if (msg.action == 'edited') {
        data.title += "PullRequest edited :" + msg.pull_request.title;
        data.title += " by " + msg, sender.login;
    }
    data.url = msg.pull_request.html_url;
    data.text += "[" + msg.pull_request.body + "]" + "(" + data.url + ")";
    return data;
}

function delete_text(msg, data) {
    data.title += msg.ref_type + ":" + msg.ref + ":" + " was deleted by " + msg.sender.login;
    return data;
}


// イベントの種類ごとに判別してデータを整形　
function conv(msg, data) {
    for (var i = 1; i < config.allow_notify_event_list.length; i++) {
        if (data.eventName == config.allow_notify_event_list[i]) {
            switch (data.eventName) {
                case 'issue_comment':
                case 'pull_request_review_comment':
                    data = comment_text(msg, data);
                    break;
                case 'issues':
                    data = issues_text(msg, data);
                    break;
                case 'push':
                    data = push_text(msg, data);
                    break;
                case 'pull_request':
                    data = pull_request_text(msg, data);
                    break;
                case 'delete':
                    data = delete_text(msg, data);
                    break;
                default :
                    break;
            }
        }
    }
    return data;
}

// AWS lambdaで動かす前提なのでhandlerのeventにgithubからpostされたデータを格納
exports.handler = function (event, context, callback) {
    var msg = JSON.parse(event.body);
    console.log(msg);
    var data = {};
    data.eventName = event.headers['X-GitHub-Event'];
    data.title = "[" + msg.repository.full_name + "] ";     // 初期値にリポジトリの名前を入れる
    data.text = "";
    data.url = "";
    var notify_flag = 0;
    // configファイルを元に知話輪のURLを作成
    const chiwawa_url = config.data.PROTCOL + config.data.chiwawa_conpany_id + "."
        + config.data.chiwawa_domain + config.data.chiwawa_message_endpoint + config.data.chiwawa_group_id + "/messages";

    // configファイルから通知をするリポジトリかどうかを判別
    for (var i = 1; i < config.allow_notify_Repo_list.length; i++) {
        if (msg.repository.full_name == config.allow_notify_Repo_list[i]) {
            notify_flag = 1;
        }
    }
    if (notify_flag == 0) {     // allow_notify_Repo_listにないリポジトリの場合は終了
        context.done();
        console.log("allow_notify_Repo_listにないリポジトリのため通知しません");
        return;
    }

    data = conv(msg, data);  // dataをevent毎に整形

    // 例外処理
    if (data.title == "[" + msg.repository.full_name + "] ") {
        context.done();
        console.log("titleに変化なし。つまり通知しないaction(" + msg.action + ")のため通知したい場合は記述が必要");
        return;
    }

    console.log(setJson(data)); //debug用


// 知話輪へPOSTリクエスト
    request({
        url: chiwawa_url,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Chiwawa-API-Token': config.data.chiwawa_api_token
        },
        json: setJson(data)
    }, function () {
        context.done();
        console.log("正常にシステムが終了しました");
        return;
    });
};
